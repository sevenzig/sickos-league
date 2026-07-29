-- Live vs async draft.
--
-- Async: no clock; commissioner starts manually (existing behavior).
-- Live: scheduled draft_at required; lobby opens 1h early; autostart at
-- draft_at; pick clock (30/60/90s); commissioner pause/resume; timeout
-- auto-picks the alphabetically-first remaining NFL team.
-- No draft chat. No ranked queue.

-- ============================================================
-- Columns
-- ============================================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_mode TEXT NOT NULL DEFAULT 'async';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_pick_seconds INTEGER NOT NULL DEFAULT 90;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_pick_deadline TIMESTAMPTZ;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_order UUID[];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leagues_draft_mode_check' AND table_name = 'leagues'
    ) THEN
        ALTER TABLE leagues ADD CONSTRAINT leagues_draft_mode_check
            CHECK (draft_mode IN ('async', 'live'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leagues_draft_pick_seconds_check' AND table_name = 'leagues'
    ) THEN
        ALTER TABLE leagues ADD CONSTRAINT leagues_draft_pick_seconds_check
            CHECK (draft_pick_seconds IN (30, 60, 90));
    END IF;
END $$;

COMMENT ON COLUMN leagues.draft_mode IS 'async | live';
COMMENT ON COLUMN leagues.draft_pick_seconds IS 'Live pick clock: 30, 60, or 90 seconds';
COMMENT ON COLUMN leagues.draft_paused IS 'Commissioner pause freezes the live pick clock';
COMMENT ON COLUMN leagues.draft_pick_deadline IS 'When the current live pick expires (NULL if async/paused/complete)';
COMMENT ON COLUMN leagues.draft_order IS 'Preset round-1 snake order (used by live autostart and optional async start)';

-- ============================================================
-- create_league: accept draft settings; live requires draft_at
-- ============================================================

DROP FUNCTION IF EXISTS create_league(TEXT, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1,
    owner_team_name TEXT DEFAULT NULL,
    p_draft_mode TEXT DEFAULT 'async',
    p_draft_at TIMESTAMPTZ DEFAULT NULL,
    p_draft_pick_seconds INTEGER DEFAULT 90
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_league_id UUID;
    current_user_id UUID;
    current_user_email TEXT;
    default_team_name TEXT;
    mode TEXT;
    pick_secs INTEGER;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    mode := COALESCE(p_draft_mode, 'async');
    IF mode NOT IN ('async', 'live') THEN
        RAISE EXCEPTION 'draft_mode must be async or live';
    END IF;

    pick_secs := COALESCE(p_draft_pick_seconds, 90);
    IF pick_secs NOT IN (30, 60, 90) THEN
        RAISE EXCEPTION 'draft_pick_seconds must be 30, 60, or 90';
    END IF;

    IF mode = 'live' AND p_draft_at IS NULL THEN
        RAISE EXCEPTION 'Live drafts require a scheduled draft time';
    END IF;

    SELECT email INTO current_user_email
    FROM auth.users
    WHERE id = current_user_id;

    IF owner_team_name IS NULL THEN
        default_team_name := COALESCE(
            split_part(current_user_email, '@', 1) || '''s Team',
            'Team 1'
        );
    ELSE
        default_team_name := owner_team_name;
    END IF;

    INSERT INTO leagues (
        name, season, teams_started_per_week, created_by,
        draft_mode, draft_at, draft_pick_seconds
    )
    VALUES (
        league_name, season, teams_started_per_week, current_user_id,
        mode, p_draft_at, pick_secs
    )
    RETURNING id INTO new_league_id;

    INSERT INTO league_members (league_id, user_id, role)
    VALUES (new_league_id, current_user_id, 'owner');

    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (new_league_id, default_team_name, current_user_id);

    INSERT INTO weeks (league_id, week_number)
    SELECT new_league_id, generate_series(1, 18);

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        new_league_id,
        current_user_id,
        'CREATE',
        'league',
        new_league_id,
        jsonb_build_object(
            'name', league_name,
            'season', season,
            'teams_started_per_week', teams_started_per_week,
            'owner_team_name', default_team_name,
            'draft_mode', mode,
            'draft_at', p_draft_at,
            'draft_pick_seconds', pick_secs
        )
    );

    RETURN new_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_league TO authenticated;

COMMENT ON FUNCTION create_league IS
    'Create a league with draft mode (async|live). Live requires draft_at.';

-- ============================================================
-- update_league_draft_settings (pending only)
-- ============================================================

CREATE OR REPLACE FUNCTION update_league_draft_settings(
    p_league_id UUID,
    p_draft_mode TEXT DEFAULT NULL,
    p_draft_at TIMESTAMPTZ DEFAULT NULL,
    p_draft_pick_seconds INTEGER DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_draft_status TEXT;
    cur_mode TEXT;
    new_mode TEXT;
    new_at TIMESTAMPTZ;
    new_secs INTEGER;
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
        RAISE EXCEPTION 'Only league owners can update draft settings';
    END IF;

    SELECT l.draft_status, l.draft_mode, l.draft_at, l.draft_pick_seconds
    INTO league_draft_status, cur_mode, new_at, new_secs
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft settings can only be changed before the draft starts';
    END IF;

    new_mode := COALESCE(p_draft_mode, cur_mode);
    IF new_mode NOT IN ('async', 'live') THEN
        RAISE EXCEPTION 'draft_mode must be async or live';
    END IF;

    -- Explicit NULL for draft_at is allowed only when switching to async via
    -- a sentinel: pass p_draft_at when changing time; keep existing otherwise.
    IF p_draft_at IS NOT NULL OR (p_draft_mode IS NOT NULL AND p_draft_mode = 'async') THEN
        IF p_draft_mode = 'async' AND p_draft_at IS NULL THEN
            new_at := NULL;
        ELSIF p_draft_at IS NOT NULL THEN
            new_at := p_draft_at;
        END IF;
    END IF;

    new_secs := COALESCE(p_draft_pick_seconds, new_secs);
    IF new_secs NOT IN (30, 60, 90) THEN
        RAISE EXCEPTION 'draft_pick_seconds must be 30, 60, or 90';
    END IF;

    IF new_mode = 'live' AND new_at IS NULL THEN
        RAISE EXCEPTION 'Live drafts require a scheduled draft time';
    END IF;

    UPDATE leagues
    SET draft_mode = new_mode,
        draft_at = new_at,
        draft_pick_seconds = new_secs
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'UPDATE',
        'draft_settings',
        p_league_id,
        jsonb_build_object(
            'draft_mode', new_mode,
            'draft_at', new_at,
            'draft_pick_seconds', new_secs
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_league_draft_settings TO authenticated;

-- ============================================================
-- set_draft_order (pending only) — required for live autostart
-- ============================================================

CREATE OR REPLACE FUNCTION set_draft_order(
    p_league_id UUID,
    p_draft_order UUID[]
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
        RAISE EXCEPTION 'Only league owners can set the draft order';
    END IF;

    SELECT l.draft_status INTO league_draft_status
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft order can only be set before the draft starts';
    END IF;

    SELECT array_agg(ft.id), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams ft
    WHERE ft.league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Draft order requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    IF array_length(p_draft_order, 1) IS DISTINCT FROM 8
       OR (SELECT COUNT(DISTINCT o) FROM unnest(p_draft_order) o) != 8
       OR EXISTS(SELECT 1 FROM unnest(p_draft_order) o WHERE o != ALL(team_ids)) THEN
        RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
    END IF;

    UPDATE leagues SET draft_order = p_draft_order WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'UPDATE',
        'draft_order',
        p_league_id,
        jsonb_build_object('draft_order', p_draft_order)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_draft_order TO authenticated;

-- ============================================================
-- start_draft: use preset order; set live pick deadline
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
    league_mode TEXT;
    league_pick_secs INTEGER;
    league_preset UUID[];
    team_ids UUID[];
    team_count INTEGER;
    v_draft_order UUID[];
    pick INTEGER;
    pick_round INTEGER;
    idx_in_round INTEGER;
    order_position INTEGER;
BEGIN
    current_user_id := auth.uid();

    -- Autostart (server tick / get_draft_state) may run with no JWT user.
    IF current_user_id IS NULL
       AND current_setting('bqbl.draft_autostart', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    -- Autostart path: service tick / get_draft_state may call without owner
    -- via draft_ensure_live_started (SECURITY DEFINER). Direct client calls
    -- still require owner.
    IF NOT is_owner AND current_setting('bqbl.draft_autostart', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Only league owners can start the draft';
    END IF;

    SELECT l.draft_status, l.draft_mode, l.draft_pick_seconds, l.draft_order
    INTO league_draft_status, league_mode, league_pick_secs, league_preset
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

    v_draft_order := COALESCE(p_draft_order, league_preset);

    IF v_draft_order IS NULL THEN
        SELECT array_agg(ft.id ORDER BY random())
        INTO v_draft_order
        FROM fantasy_teams ft
        WHERE ft.league_id = p_league_id;
    ELSE
        IF array_length(v_draft_order, 1) IS DISTINCT FROM 8
           OR (SELECT COUNT(DISTINCT o) FROM unnest(v_draft_order) o) != 8
           OR EXISTS(SELECT 1 FROM unnest(v_draft_order) o WHERE o != ALL(team_ids)) THEN
            RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
        END IF;
    END IF;

    FOR pick IN 1..32 LOOP
        pick_round := ((pick - 1) / 8) + 1;
        idx_in_round := ((pick - 1) % 8) + 1;
        order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;

        INSERT INTO draft_picks (league_id, pick_number, round, fantasy_team_id)
        VALUES (p_league_id, pick, pick_round, v_draft_order[order_position]);
    END LOOP;

    UPDATE leagues
    SET draft_status = 'in_progress',
        draft_current_pick = 1,
        draft_paused = FALSE,
        draft_order = v_draft_order,
        draft_pick_deadline = CASE
            WHEN league_mode = 'live' THEN NOW() + make_interval(secs => league_pick_secs)
            ELSE NULL
        END
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'START',
        'draft',
        p_league_id,
        jsonb_build_object(
            'draft_order', v_draft_order,
            'draft_mode', league_mode,
            'autostart', current_setting('bqbl.draft_autostart', true) = 'on'
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_draft TO authenticated;

-- ============================================================
-- draft_execute_pick: block when paused; advance live deadline
-- ============================================================

-- Drop the 3-arg overload first. CREATE OR REPLACE with a new arg creates a
-- second overload; REVOKE without a signature then fails ("not unique").
DROP FUNCTION IF EXISTS draft_execute_pick(UUID, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION draft_execute_pick(
    p_league_id UUID,
    p_nfl_team_id UUID,
    p_require_manager BOOLEAN,
    p_is_auto BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    league_draft_status TEXT;
    league_paused BOOLEAN;
    league_mode TEXT;
    league_pick_secs INTEGER;
    current_pick INTEGER;
    pick_id UUID;
    picking_team_id UUID;
    picking_team_manager UUID;
BEGIN
    current_user_id := auth.uid();

    SELECT l.draft_status, l.draft_current_pick, l.draft_paused, l.draft_mode, l.draft_pick_seconds
    INTO league_draft_status, current_pick, league_paused, league_mode, league_pick_secs
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Draft is not in progress';
    END IF;

    IF league_paused AND NOT p_is_auto THEN
        RAISE EXCEPTION 'Draft is paused';
    END IF;

    SELECT dp.id, dp.fantasy_team_id, ft.manager_user_id
    INTO pick_id, picking_team_id, picking_team_manager
    FROM draft_picks dp
    JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
    WHERE dp.league_id = p_league_id AND dp.pick_number = current_pick;

    IF p_require_manager AND (picking_team_manager IS NULL OR picking_team_manager != current_user_id) THEN
        RAISE EXCEPTION 'It is not your pick (pick % belongs to another team)', current_pick;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM teams t WHERE t.uuid_id = p_nfl_team_id AND t.is_nfl) THEN
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
        SET draft_status = 'complete',
            draft_current_pick = NULL,
            draft_pick_deadline = NULL,
            draft_paused = FALSE
        WHERE id = p_league_id;
    ELSE
        UPDATE leagues
        SET draft_current_pick = current_pick + 1,
            draft_pick_deadline = CASE
                WHEN league_mode = 'live' AND NOT league_paused
                    THEN NOW() + make_interval(secs => league_pick_secs)
                ELSE NULL
            END
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
            'is_commissioner_override', NOT p_require_manager AND NOT p_is_auto,
            'is_auto_pick', p_is_auto
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM authenticated;

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

    RETURN draft_execute_pick(p_league_id, p_nfl_team_id, TRUE, FALSE);
END;
$$;

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

    RETURN draft_execute_pick(p_league_id, p_nfl_team_id, FALSE, FALSE);
END;
$$;

-- ============================================================
-- Live: autostart + timeout auto-pick + pause/resume
-- ============================================================

CREATE OR REPLACE FUNCTION draft_ensure_live_started(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    league_mode TEXT;
    league_status TEXT;
    league_at TIMESTAMPTZ;
    team_count INTEGER;
BEGIN
    SELECT l.draft_mode, l.draft_status, l.draft_at
    INTO league_mode, league_status, league_at
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND OR league_mode IS DISTINCT FROM 'live' OR league_status IS DISTINCT FROM 'pending' THEN
        RETURN FALSE;
    END IF;

    IF league_at IS NULL OR NOW() < league_at THEN
        RETURN FALSE;
    END IF;

    SELECT COUNT(*) INTO team_count
    FROM fantasy_teams ft WHERE ft.league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RETURN FALSE;
    END IF;

    PERFORM set_config('bqbl.draft_autostart', 'on', true);
    PERFORM start_draft(p_league_id, NULL);
    PERFORM set_config('bqbl.draft_autostart', 'off', true);

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_ensure_live_started FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_ensure_live_started FROM authenticated;

CREATE OR REPLACE FUNCTION draft_expire_current_pick(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    league_mode TEXT;
    league_status TEXT;
    league_paused BOOLEAN;
    league_deadline TIMESTAMPTZ;
    auto_nfl_id UUID;
BEGIN
    SELECT l.draft_mode, l.draft_status, l.draft_paused, l.draft_pick_deadline
    INTO league_mode, league_status, league_paused, league_deadline
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND
       OR league_mode IS DISTINCT FROM 'live'
       OR league_status IS DISTINCT FROM 'in_progress'
       OR league_paused
       OR league_deadline IS NULL
       OR NOW() < league_deadline THEN
        RETURN FALSE;
    END IF;

    SELECT t.uuid_id INTO auto_nfl_id
    FROM teams t
    WHERE t.is_nfl
      AND NOT EXISTS (
          SELECT 1 FROM draft_picks dp
          WHERE dp.league_id = p_league_id AND dp.nfl_team_id = t.uuid_id
      )
    ORDER BY t.name
    LIMIT 1;

    IF auto_nfl_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN draft_execute_pick(p_league_id, auto_nfl_id, FALSE, TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_expire_current_pick FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_expire_current_pick FROM authenticated;

-- Server cron: advance all live drafts (autostart + timeouts)
CREATE OR REPLACE FUNCTION draft_tick_all()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    r RECORD;
    n INTEGER := 0;
BEGIN
    FOR r IN
        SELECT l.id
        FROM leagues l
        WHERE l.draft_mode = 'live'
          AND l.draft_status IN ('pending', 'in_progress')
    LOOP
        IF draft_ensure_live_started(r.id) THEN
            n := n + 1;
        END IF;
        -- Expire may chain if multiple deadlines somehow lag; loop a few times
        WHILE draft_expire_current_pick(r.id) LOOP
            n := n + 1;
        END LOOP;
    END LOOP;

    RETURN n;
END;
$$;

-- Callable by service_role / server only (not authenticated clients)
REVOKE EXECUTE ON FUNCTION draft_tick_all FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_tick_all FROM authenticated;
GRANT EXECUTE ON FUNCTION draft_tick_all TO service_role;

CREATE OR REPLACE FUNCTION pause_draft(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    league_status TEXT;
    league_mode TEXT;
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
        RAISE EXCEPTION 'Only league owners can pause the draft';
    END IF;

    SELECT l.draft_status, l.draft_mode
    INTO league_status, league_mode
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_mode IS DISTINCT FROM 'live' THEN
        RAISE EXCEPTION 'Only live drafts can be paused';
    END IF;

    IF league_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Draft is not in progress';
    END IF;

    UPDATE leagues
    SET draft_paused = TRUE,
        draft_pick_deadline = NULL
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (p_league_id, auth.uid(), 'PAUSE', 'draft', p_league_id, '{}'::jsonb);

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION pause_draft TO authenticated;

CREATE OR REPLACE FUNCTION resume_draft(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    league_status TEXT;
    league_mode TEXT;
    league_pick_secs INTEGER;
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
        RAISE EXCEPTION 'Only league owners can resume the draft';
    END IF;

    SELECT l.draft_status, l.draft_mode, l.draft_pick_seconds
    INTO league_status, league_mode, league_pick_secs
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_mode IS DISTINCT FROM 'live' THEN
        RAISE EXCEPTION 'Only live drafts can be resumed';
    END IF;

    IF league_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Draft is not in progress';
    END IF;

    UPDATE leagues
    SET draft_paused = FALSE,
        draft_pick_deadline = NOW() + make_interval(secs => league_pick_secs)
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (p_league_id, auth.uid(), 'RESUME', 'draft', p_league_id, '{}'::jsonb);

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION resume_draft TO authenticated;

-- ============================================================
-- get_draft_state: tick live progress + richer payload
-- ============================================================

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

    PERFORM draft_ensure_live_started(p_league_id);
    PERFORM draft_expire_current_pick(p_league_id);

    SELECT jsonb_build_object(
        'draft_status', l.draft_status,
        'draft_mode', l.draft_mode,
        'draft_at', l.draft_at,
        'draft_pick_seconds', l.draft_pick_seconds,
        'draft_paused', l.draft_paused,
        'draft_pick_deadline', l.draft_pick_deadline,
        'draft_current_pick', l.draft_current_pick,
        'room_opens_at', CASE
            WHEN l.draft_mode = 'live' AND l.draft_at IS NOT NULL
                THEN l.draft_at - INTERVAL '1 hour'
            ELSE NULL
        END,
        'draft_order_set', (l.draft_order IS NOT NULL),
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

-- ============================================================
-- League list/details: expose draft_mode + pick clock settings
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
        AND COALESCE(l.draft_paused, FALSE) = FALSE
        AND EXISTS (
            SELECT 1
            FROM draft_picks dp
            JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
            WHERE dp.league_id = l.id
              AND dp.pick_number = l.draft_current_pick
              AND ft.manager_user_id = auth.uid()
        )
    ) as my_pick,
    l.draft_mode,
    l.draft_pick_seconds,
    l.draft_paused
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
    my_pick BOOLEAN,
    draft_mode TEXT,
    draft_pick_seconds INTEGER,
    draft_paused BOOLEAN
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
    my_pick BOOLEAN,
    draft_mode TEXT,
    draft_pick_seconds INTEGER,
    draft_paused BOOLEAN
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
