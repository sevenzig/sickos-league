-- Phase 2: Async snake draft, modeled as a state machine in Postgres.
--
-- 2.1 Draft state: leagues.draft_status / draft_current_pick + draft_picks
-- 2.2 start_draft: pre-creates all 32 pick slots in snake order
-- 2.3 make_draft_pick / make_draft_pick_for (commissioner override)
--     get_draft_state: single JSONB payload for the draft room UI
-- 2.5 v_user_leagues gains draft_status + my_pick (in-app "Your pick!" badge)
-- 2.6 Gates: schedule generation requires a complete draft; invite redemption
--     closes once the draft starts.

-- ============================================================
-- 2.1 Draft state
-- ============================================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_current_pick INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leagues_draft_status_check' AND table_name = 'leagues'
    ) THEN
        ALTER TABLE leagues ADD CONSTRAINT leagues_draft_status_check
            CHECK (draft_status IN ('pending', 'in_progress', 'complete'));
    END IF;
END $$;

COMMENT ON COLUMN leagues.draft_status IS 'pending | in_progress | complete';
COMMENT ON COLUMN leagues.draft_current_pick IS 'Pick number on the clock (1-32) while in_progress; NULL otherwise';

CREATE TABLE IF NOT EXISTS draft_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    pick_number INTEGER NOT NULL,        -- 1..32
    round INTEGER NOT NULL,              -- 1..4
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id),
    nfl_team_id UUID REFERENCES teams(uuid_id),  -- NULL until picked
    picked_at TIMESTAMPTZ,

    CONSTRAINT draft_picks_league_pick_unique UNIQUE (league_id, pick_number),
    CONSTRAINT draft_picks_league_nfl_unique UNIQUE (league_id, nfl_team_id),
    CONSTRAINT draft_picks_pick_number_valid CHECK (pick_number >= 1 AND pick_number <= 32),
    CONSTRAINT draft_picks_round_valid CHECK (round >= 1 AND round <= 4)
);

CREATE INDEX IF NOT EXISTS draft_picks_league_idx ON draft_picks(league_id);

COMMENT ON TABLE draft_picks IS 'Snake draft pick slots (pre-created by start_draft, filled by make_draft_pick)';

-- RLS: league members read; writes only via SECURITY DEFINER RPCs
ALTER TABLE draft_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS draft_picks_member_read ON draft_picks;
CREATE POLICY draft_picks_member_read ON draft_picks
    FOR SELECT USING (is_league_member(league_id));

GRANT SELECT ON draft_picks TO authenticated;

-- ============================================================
-- 2.2 start_draft: commissioner-only, requires exactly 8 fantasy teams.
--     Order supplied by the commissioner or randomized server-side.
--     Pre-creates all 32 slots in snake order (rounds 1&3 forward, 2&4 reverse).
-- ============================================================

CREATE OR REPLACE FUNCTION start_draft(
    p_league_id UUID,
    p_draft_order UUID[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_draft_status TEXT;
    team_ids UUID[];
    team_count INTEGER;
    draft_order UUID[];
    pick INTEGER;
    pick_round INTEGER;
    idx_in_round INTEGER;
    order_position INTEGER;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can start the draft';
    END IF;

    -- Lock the league row to serialize draft state changes
    SELECT l.draft_status INTO league_draft_status
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft has already started for this league';
    END IF;

    SELECT array_agg(ft.id), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams ft
    WHERE ft.league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Starting a draft requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    IF p_draft_order IS NULL THEN
        SELECT array_agg(ft.id ORDER BY random())
        INTO draft_order
        FROM fantasy_teams ft
        WHERE ft.league_id = p_league_id;
    ELSE
        -- Supplied order must be exactly this league's 8 teams, no repeats
        IF array_length(p_draft_order, 1) IS DISTINCT FROM 8
           OR (SELECT COUNT(DISTINCT o) FROM unnest(p_draft_order) o) != 8
           OR EXISTS(
               SELECT 1 FROM unnest(p_draft_order) o
               WHERE o != ALL(team_ids)
           ) THEN
            RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
        END IF;
        draft_order := p_draft_order;
    END IF;

    -- Pre-create the 32 pick slots in snake order
    FOR pick IN 1..32 LOOP
        pick_round := ((pick - 1) / 8) + 1;
        idx_in_round := ((pick - 1) % 8) + 1;
        order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;

        INSERT INTO draft_picks (league_id, pick_number, round, fantasy_team_id)
        VALUES (p_league_id, pick, pick_round, draft_order[order_position]);
    END LOOP;

    UPDATE leagues
    SET draft_status = 'in_progress', draft_current_pick = 1
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'START',
        'draft',
        p_league_id,
        jsonb_build_object(
            'draft_order', draft_order,
            'randomized', p_draft_order IS NULL
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_draft TO authenticated;

COMMENT ON FUNCTION start_draft IS 'Start the async snake draft: pre-create 32 pick slots (owner only, 8 teams required)';

-- ============================================================
-- 2.3 Making picks. Shared logic lives in draft_execute_pick (not granted
--     to authenticated); the public RPCs differ only in authorization.
-- ============================================================

CREATE OR REPLACE FUNCTION draft_execute_pick(
    p_league_id UUID,
    p_nfl_team_id UUID,
    p_require_manager BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    league_draft_status TEXT;
    current_pick INTEGER;
    pick_id UUID;
    picking_team_id UUID;
    picking_team_manager UUID;
BEGIN
    current_user_id := auth.uid();

    -- Lock the league row so concurrent picks serialize
    SELECT l.draft_status, l.draft_current_pick
    INTO league_draft_status, current_pick
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Draft is not in progress';
    END IF;

    SELECT dp.id, dp.fantasy_team_id, ft.manager_user_id
    INTO pick_id, picking_team_id, picking_team_manager
    FROM draft_picks dp
    JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
    WHERE dp.league_id = p_league_id AND dp.pick_number = current_pick;

    IF p_require_manager AND (picking_team_manager IS NULL OR picking_team_manager != current_user_id) THEN
        RAISE EXCEPTION 'It is not your pick (pick % belongs to another team)', current_pick;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM teams t WHERE t.uuid_id = p_nfl_team_id) THEN
        RAISE EXCEPTION 'Invalid NFL team ID provided';
    END IF;

    IF EXISTS(
        SELECT 1 FROM draft_picks dp
        WHERE dp.league_id = p_league_id AND dp.nfl_team_id = p_nfl_team_id
    ) THEN
        RAISE EXCEPTION 'That NFL team has already been drafted';
    END IF;

    UPDATE draft_picks
    SET nfl_team_id = p_nfl_team_id, picked_at = NOW()
    WHERE id = pick_id;

    INSERT INTO fantasy_team_rosters (league_id, fantasy_team_id, nfl_team_id, acquired_via, draft_pick_number)
    VALUES (p_league_id, picking_team_id, p_nfl_team_id, 'draft', current_pick);

    IF current_pick >= 32 THEN
        UPDATE leagues
        SET draft_status = 'complete', draft_current_pick = NULL
        WHERE id = p_league_id;
    ELSE
        UPDATE leagues
        SET draft_current_pick = current_pick + 1
        WHERE id = p_league_id;
    END IF;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'PICK',
        'draft_pick',
        pick_id,
        jsonb_build_object(
            'pick_number', current_pick,
            'fantasy_team_id', picking_team_id,
            'nfl_team_id', p_nfl_team_id,
            'is_commissioner_override', NOT p_require_manager
        )
    );

    RETURN TRUE;
END;
$$;

-- Internal helper only: callable from the public RPCs below, not the API
REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM authenticated;

-- Manager on the clock makes their own pick
CREATE OR REPLACE FUNCTION make_draft_pick(
    p_league_id UUID,
    p_nfl_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    RETURN draft_execute_pick(p_league_id, p_nfl_team_id, TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION make_draft_pick TO authenticated;

COMMENT ON FUNCTION make_draft_pick IS 'Make the on-the-clock draft pick for your own fantasy team';

-- Commissioner override: pick on behalf of whichever team is on the clock
CREATE OR REPLACE FUNCTION make_draft_pick_for(
    p_league_id UUID,
    p_nfl_team_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can pick on behalf of another team';
    END IF;

    RETURN draft_execute_pick(p_league_id, p_nfl_team_id, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION make_draft_pick_for TO authenticated;

COMMENT ON FUNCTION make_draft_pick_for IS 'Commissioner override: make the on-the-clock pick for an absent manager';

-- Draft room payload: status + on-clock team + full pick list in one call
CREATE OR REPLACE FUNCTION get_draft_state(p_league_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_league_member(p_league_id) THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    SELECT jsonb_build_object(
        'draft_status', l.draft_status,
        'draft_current_pick', l.draft_current_pick,
        'on_clock', (
            SELECT jsonb_build_object(
                'fantasy_team_id', ft.id,
                'team_name', ft.team_name,
                'manager_user_id', ft.manager_user_id
            )
            FROM draft_picks dp
            JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
            WHERE dp.league_id = l.id AND dp.pick_number = l.draft_current_pick
        ),
        'picks', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'pick_number', dp.pick_number,
                'round', dp.round,
                'fantasy_team_id', dp.fantasy_team_id,
                'fantasy_team_name', ft.team_name,
                'nfl_team_id', dp.nfl_team_id,
                'nfl_team_name', t.name,
                'picked_at', dp.picked_at
            ) ORDER BY dp.pick_number)
            FROM draft_picks dp
            JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
            LEFT JOIN teams t ON t.uuid_id = dp.nfl_team_id
            WHERE dp.league_id = l.id
        ), '[]'::jsonb)
    )
    INTO result
    FROM leagues l
    WHERE l.id = p_league_id;

    IF result IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_draft_state TO authenticated;

COMMENT ON FUNCTION get_draft_state IS 'Draft status, on-the-clock team, and all 32 picks as one JSONB payload';

-- ============================================================
-- 2.5 In-app "Your pick!" badge: v_user_leagues gains draft_status + my_pick.
--     get_user_leagues / get_league_details must be dropped and recreated
--     because their return types change.
-- ============================================================

CREATE OR REPLACE VIEW v_user_leagues AS
SELECT
    l.id,
    l.name,
    l.season,
    l.teams_started_per_week,
    l.draft_at,
    l.created_at,
    lm.role as user_role,
    (SELECT COUNT(*) FROM league_members lm2 WHERE lm2.league_id = l.id) as member_count,
    (SELECT COUNT(*) FROM fantasy_teams ft WHERE ft.league_id = l.id) as fantasy_teams_count,
    (SELECT lm_owner.user_id FROM league_members lm_owner WHERE lm_owner.league_id = l.id AND lm_owner.role = 'owner' LIMIT 1) as owner_user_id,
    l.draft_status,
    (
        l.draft_status = 'in_progress'
        AND EXISTS (
            SELECT 1
            FROM draft_picks dp
            JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
            WHERE dp.league_id = l.id
              AND dp.pick_number = l.draft_current_pick
              AND ft.manager_user_id = auth.uid()
        )
    ) as my_pick
FROM leagues l
JOIN league_members lm ON l.id = lm.league_id
WHERE lm.user_id = auth.uid();

GRANT SELECT ON v_user_leagues TO authenticated;

DROP FUNCTION IF EXISTS get_user_leagues();

CREATE OR REPLACE FUNCTION get_user_leagues()
RETURNS TABLE (
    id UUID,
    name TEXT,
    season INTEGER,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    user_role TEXT,
    member_count BIGINT,
    fantasy_teams_count BIGINT,
    owner_user_id UUID,
    draft_status TEXT,
    my_pick BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    RETURN QUERY
    SELECT * FROM v_user_leagues
    ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_leagues TO authenticated;

DROP FUNCTION IF EXISTS get_league_details(UUID);

CREATE OR REPLACE FUNCTION get_league_details(league_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    season INTEGER,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    user_role TEXT,
    member_count BIGINT,
    fantasy_teams_count BIGINT,
    owner_user_id UUID,
    draft_status TEXT,
    my_pick BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_league_details.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT * FROM v_user_leagues
    WHERE v_user_leagues.id = get_league_details.league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_details TO authenticated;

-- ============================================================
-- 2.6 Gates
-- ============================================================

-- generate_league_schedule requires draft_status = 'complete'.
-- Identical to 20241031000007 plus the draft gate.
CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    league_draft_status TEXT;
    team_count INTEGER;
    team_ids UUID[];
    week_num INTEGER;
    round_idx INTEGER;  -- 0..6, which round-robin round this week uses
    flip BOOLEAN;       -- reverse home/away for the second meeting
    k INTEGER;
    team1_id UUID;
    team2_id UUID;
    swap_id UUID;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    -- Get fantasy teams in this league
    SELECT array_agg(id ORDER BY team_name), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Schedule generation requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    -- Phase 2 gate: rosters must exist before a schedule means anything
    SELECT draft_status INTO league_draft_status
    FROM leagues WHERE id = p_league_id;

    IF league_draft_status IS DISTINCT FROM 'complete' THEN
        RAISE EXCEPTION 'Schedule generation requires a completed draft (draft is %)', league_draft_status;
    END IF;

    -- Clear existing matchups
    DELETE FROM league_matchups WHERE league_id = p_league_id;

    FOR week_num IN 1..18 LOOP
        round_idx := (week_num - 1) % 7;
        flip := week_num BETWEEN 8 AND 14;

        -- Circle method: team 8 is fixed, teams 1-7 rotate.
        -- k = 0 pairs the rotating slot with the fixed team;
        -- k = 1..3 pair positions equidistant around the circle.
        FOR k IN 0..3 LOOP
            IF k = 0 THEN
                team1_id := team_ids[round_idx + 1];
                team2_id := team_ids[8];
            ELSE
                team1_id := team_ids[((round_idx + k) % 7) + 1];
                team2_id := team_ids[((round_idx - k + 7) % 7) + 1];
            END IF;

            IF flip THEN
                swap_id := team1_id;
                team1_id := team2_id;
                team2_id := swap_id;
            END IF;

            INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
            VALUES (p_league_id, week_num, team1_id, team2_id);
        END LOOP;
    END LOOP;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        p_league_id,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', 18,
            'matchups_generated', 72
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;

COMMENT ON FUNCTION generate_league_schedule IS 'Generate 18-week round-robin schedule (4 matchups/week); requires 8 teams and a completed draft';

-- redeem_invite_code closes once the draft starts.
-- Identical to 20241031000004 plus the draft gate.
CREATE OR REPLACE FUNCTION redeem_invite_code(
    p_invite_code TEXT,
    p_team_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation_id UUID;
    v_league_id UUID;
    v_league_name TEXT;
    v_draft_status TEXT;
    v_user_id UUID;
    v_existing_member BOOLEAN;
    v_team_name_exists BOOLEAN;
    v_fantasy_team_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate and get invitation details
    SELECT
        li.id,
        li.league_id,
        l.name,
        l.draft_status
    INTO v_invitation_id, v_league_id, v_league_name, v_draft_status
    FROM league_invitations li
    JOIN leagues l ON li.league_id = l.id
    WHERE li.code = UPPER(p_invite_code)
      AND li.is_active = true
      AND li.expires_at > NOW()
      AND li.used_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or already used invite code';
    END IF;

    -- Phase 2 gate: no new members once the draft has started
    IF v_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'This league''s draft has started; new members can no longer join';
    END IF;

    -- Check if user is already a member of this league
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = v_league_id AND user_id = v_user_id
    ) INTO v_existing_member;

    IF v_existing_member THEN
        RAISE EXCEPTION 'You are already a member of this league';
    END IF;

    -- Check if team name already exists in this league
    SELECT EXISTS(
        SELECT 1 FROM fantasy_teams
        WHERE league_id = v_league_id AND LOWER(team_name) = LOWER(p_team_name)
    ) INTO v_team_name_exists;

    IF v_team_name_exists THEN
        RAISE EXCEPTION 'Team name "%" already exists in this league', p_team_name;
    END IF;

    -- Mark invitation as used
    UPDATE league_invitations
    SET
        used_at = NOW(),
        used_by_user_id = v_user_id,
        is_active = false
    WHERE id = v_invitation_id;

    -- Add user as league member
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (v_league_id, v_user_id, 'member');

    -- Create fantasy team for the user
    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (v_league_id, p_team_name, v_user_id)
    RETURNING id INTO v_fantasy_team_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        v_league_id,
        v_user_id,
        'JOIN',
        'league',
        v_league_id,
        jsonb_build_object(
            'invite_code', p_invite_code,
            'team_name', p_team_name,
            'fantasy_team_id', v_fantasy_team_id
        )
    );

    RETURN v_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_invite_code TO authenticated;

-- Verification (run in SQL editor against a seeded 8-team league):
--
--   SELECT start_draft('<league-id>');
--   -- picks table has 32 rows, 4 per team, snake order:
--   SELECT pick_number, round, fantasy_team_id FROM draft_picks
--   WHERE league_id = '<league-id>' ORDER BY pick_number;
--
--   -- out-of-turn pick fails; duplicate NFL team fails; 32 sequential
--   -- picks complete the draft and produce 8 rosters of 4 covering all 32:
--   SELECT make_draft_pick('<league-id>', '<nfl-uuid>');
--   SELECT draft_status FROM leagues WHERE id = '<league-id>';   -- 'complete' after pick 32
--   SELECT fantasy_team_id, COUNT(*) FROM fantasy_team_rosters
--   WHERE league_id = '<league-id>' GROUP BY fantasy_team_id;    -- 8 rows of 4
--
--   -- gates:
--   SELECT generate_league_schedule('<league-id>');  -- errors unless draft complete
--   SELECT redeem_invite_code('<code>', 'Team X');   -- errors once draft started
