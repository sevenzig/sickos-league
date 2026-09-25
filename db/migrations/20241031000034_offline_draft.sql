-- Offline draft: commissioner assigns all 32 NFL teams in one step.
-- No pick clock. Membership locks when the commissioner starts assignment.

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_draft_mode_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_draft_mode_check
    CHECK (draft_mode IN ('async', 'live', 'offline'));

COMMENT ON COLUMN leagues.draft_mode IS 'async | live | offline';

-- ============================================================
-- create_league: accept offline (no scheduled time)
-- ============================================================

DROP FUNCTION IF EXISTS create_league(TEXT, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1,
    owner_team_name TEXT DEFAULT NULL,
    p_draft_mode TEXT DEFAULT 'async',
    p_draft_at TIMESTAMPTZ DEFAULT NULL,
    p_draft_pick_seconds INTEGER DEFAULT 90,
    p_draft_format TEXT DEFAULT 'snake'
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
    fmt TEXT;
    stored_at TIMESTAMPTZ;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    mode := COALESCE(p_draft_mode, 'async');
    IF mode NOT IN ('async', 'live', 'offline') THEN
        RAISE EXCEPTION 'draft_mode must be async, live, or offline';
    END IF;

    pick_secs := COALESCE(p_draft_pick_seconds, 90);
    IF pick_secs NOT IN (30, 60, 90) THEN
        RAISE EXCEPTION 'draft_pick_seconds must be 30, 60, or 90';
    END IF;

    fmt := COALESCE(p_draft_format, 'snake');
    IF fmt NOT IN ('snake', 'linear') THEN
        RAISE EXCEPTION 'draft_format must be snake or linear';
    END IF;

    IF mode = 'live' AND p_draft_at IS NULL THEN
        RAISE EXCEPTION 'Live drafts require a scheduled draft time';
    END IF;

    -- Offline ignores a scheduled time. Pick seconds stay stored and unused.
    stored_at := CASE WHEN mode = 'offline' THEN NULL ELSE p_draft_at END;

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
        draft_mode, draft_at, draft_pick_seconds, draft_format
    )
    VALUES (
        league_name, season, teams_started_per_week, current_user_id,
        mode, stored_at, pick_secs, fmt
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
            'draft_at', stored_at,
            'draft_pick_seconds', pick_secs,
            'draft_format', fmt
        )
    );

    RETURN new_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_league TO authenticated;

COMMENT ON FUNCTION create_league IS
    'Create a league with draft mode (async|live|offline) and format (snake|linear). Live requires draft_at.';

-- ============================================================
-- update_league_draft_settings (pending only)
-- ============================================================

DROP FUNCTION IF EXISTS update_league_draft_settings(UUID, TEXT, TIMESTAMPTZ, INTEGER);

CREATE OR REPLACE FUNCTION update_league_draft_settings(
    p_league_id UUID,
    p_draft_mode TEXT DEFAULT NULL,
    p_draft_at TIMESTAMPTZ DEFAULT NULL,
    p_draft_pick_seconds INTEGER DEFAULT NULL,
    p_draft_format TEXT DEFAULT NULL
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
    cur_format TEXT;
    new_format TEXT;
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

    SELECT l.draft_status, l.draft_mode, l.draft_at, l.draft_pick_seconds, l.draft_format
    INTO league_draft_status, cur_mode, new_at, new_secs, cur_format
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft settings can only be changed before the draft starts';
    END IF;

    new_mode := COALESCE(p_draft_mode, cur_mode);
    IF new_mode NOT IN ('async', 'live', 'offline') THEN
        RAISE EXCEPTION 'draft_mode must be async, live, or offline';
    END IF;

    -- Offline never keeps a scheduled time. Async clears draft_at only when
    -- the caller switches mode and passes a null time.
    IF new_mode = 'offline' THEN
        new_at := NULL;
    ELSIF p_draft_at IS NOT NULL OR (p_draft_mode IS NOT NULL AND p_draft_mode = 'async') THEN
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

    new_format := COALESCE(p_draft_format, cur_format);
    IF new_format NOT IN ('snake', 'linear') THEN
        RAISE EXCEPTION 'draft_format must be snake or linear';
    END IF;

    IF new_mode = 'live' AND new_at IS NULL THEN
        RAISE EXCEPTION 'Live drafts require a scheduled draft time';
    END IF;

    UPDATE leagues
    SET draft_mode = new_mode,
        draft_at = new_at,
        draft_pick_seconds = new_secs,
        draft_format = new_format
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
            'draft_pick_seconds', new_secs,
            'draft_format', new_format
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_league_draft_settings TO authenticated;

-- ============================================================
-- start_draft: refuse offline (no clock, no current pick)
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
    league_format TEXT;
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

    SELECT l.draft_status, l.draft_mode, l.draft_pick_seconds, l.draft_order, l.draft_format
    INTO league_draft_status, league_mode, league_pick_secs, league_preset, league_format
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft has already started for this league';
    END IF;

    IF league_mode = 'offline' THEN
        RAISE EXCEPTION 'Offline drafts use start_offline_draft';
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
        IF league_format = 'linear' THEN
            order_position := idx_in_round;
        ELSE
            -- snake (default): odd rounds forward, even rounds reverse
            order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;
        END IF;

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
            'draft_format', league_format,
            'autostart', current_setting('bqbl.draft_autostart', true) = 'on'
        )
    );

    -- Auto-generate season schedule if the commissioner has not already done so.
    IF NOT EXISTS (
        SELECT 1 FROM league_matchups WHERE league_id = p_league_id LIMIT 1
    ) THEN
        PERFORM _generate_league_schedule_impl(p_league_id);
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_draft TO authenticated;

-- ============================================================
-- start_offline_draft: lock membership, create empty slots, no clock
-- ============================================================

CREATE OR REPLACE FUNCTION start_offline_draft(
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
    league_format TEXT;
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

    SELECT l.draft_status, l.draft_mode, l.draft_order, l.draft_format
    INTO league_draft_status, league_mode, league_preset, league_format
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_mode IS DISTINCT FROM 'offline' THEN
        RAISE EXCEPTION 'start_offline_draft is only for offline drafts';
    END IF;

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
        RAISE EXCEPTION 'Offline draft requires a saved draft order';
    END IF;

    IF array_length(v_draft_order, 1) IS DISTINCT FROM 8
       OR (SELECT COUNT(DISTINCT o) FROM unnest(v_draft_order) o) != 8
       OR EXISTS(SELECT 1 FROM unnest(v_draft_order) o WHERE o != ALL(team_ids)) THEN
        RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
    END IF;

    FOR pick IN 1..32 LOOP
        pick_round := ((pick - 1) / 8) + 1;
        idx_in_round := ((pick - 1) % 8) + 1;
        IF league_format = 'linear' THEN
            order_position := idx_in_round;
        ELSE
            order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;
        END IF;

        INSERT INTO draft_picks (league_id, pick_number, round, fantasy_team_id)
        VALUES (p_league_id, pick, pick_round, v_draft_order[order_position]);
    END LOOP;

    UPDATE leagues
    SET draft_status = 'in_progress',
        draft_current_pick = NULL,
        draft_paused = FALSE,
        draft_order = v_draft_order,
        draft_pick_deadline = NULL
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
            'draft_format', league_format
        )
    );

    IF NOT EXISTS (
        SELECT 1 FROM league_matchups WHERE league_id = p_league_id LIMIT 1
    ) THEN
        PERFORM _generate_league_schedule_impl(p_league_id);
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_offline_draft TO authenticated;

COMMENT ON FUNCTION start_offline_draft IS
    'Start an offline draft: lock joins, create 32 empty pick slots (snake or linear), no clock';

-- ============================================================
-- set_offline_draft_picks: one transaction fills every slot
-- ============================================================

CREATE OR REPLACE FUNCTION set_offline_draft_picks(
    p_league_id UUID,
    p_picks JSONB
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
    incoming_count INTEGER;
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
        RAISE EXCEPTION 'Only league owners can assign offline draft picks';
    END IF;

    SELECT l.draft_status, l.draft_mode
    INTO league_draft_status, league_mode
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_mode IS DISTINCT FROM 'offline' THEN
        RAISE EXCEPTION 'set_offline_draft_picks is only for offline drafts';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Offline draft is not open for assignment';
    END IF;

    IF jsonb_typeof(p_picks) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Picks must be a JSON array';
    END IF;

    CREATE TEMP TABLE _offline_picks (
        pick_number INTEGER,
        nfl_team_id UUID
    ) ON COMMIT DROP;

    INSERT INTO _offline_picks (pick_number, nfl_team_id)
    SELECT (elem->>'pick_number')::INTEGER, (elem->>'nfl_team_id')::UUID
    FROM jsonb_array_elements(p_picks) elem;

    SELECT COUNT(*) INTO incoming_count FROM _offline_picks;

    IF incoming_count IS DISTINCT FROM 32
       OR (SELECT COUNT(DISTINCT pick_number) FROM _offline_picks) IS DISTINCT FROM 32
       OR (SELECT MIN(pick_number) FROM _offline_picks) IS DISTINCT FROM 1
       OR (SELECT MAX(pick_number) FROM _offline_picks) IS DISTINCT FROM 32
       OR EXISTS (SELECT 1 FROM _offline_picks WHERE pick_number IS NULL OR nfl_team_id IS NULL) THEN
        RAISE EXCEPTION 'Offline draft must include each pick from 1 to 32 exactly once';
    END IF;

    IF (SELECT COUNT(DISTINCT nfl_team_id) FROM _offline_picks) IS DISTINCT FROM 32
       OR EXISTS (
           SELECT 1 FROM _offline_picks ip
           WHERE NOT EXISTS (
               SELECT 1 FROM teams t WHERE t.uuid_id = ip.nfl_team_id AND t.is_nfl
           )
       )
       OR EXISTS (
           SELECT 1 FROM teams t
           WHERE t.is_nfl
             AND NOT EXISTS (SELECT 1 FROM _offline_picks ip WHERE ip.nfl_team_id = t.uuid_id)
       ) THEN
        RAISE EXCEPTION 'Offline draft must assign each NFL team exactly once';
    END IF;

    IF (SELECT COUNT(*) FROM draft_picks WHERE league_id = p_league_id) IS DISTINCT FROM 32
       OR EXISTS (
           SELECT 1 FROM draft_picks dp
           WHERE dp.league_id = p_league_id AND dp.nfl_team_id IS NOT NULL
       )
       OR EXISTS (
           SELECT 1 FROM _offline_picks ip
           WHERE NOT EXISTS (
               SELECT 1 FROM draft_picks dp
               WHERE dp.league_id = p_league_id AND dp.pick_number = ip.pick_number
           )
       ) THEN
        RAISE EXCEPTION 'Offline draft slots are missing or already filled';
    END IF;

    IF EXISTS (
        SELECT 1 FROM draft_picks dp
        WHERE dp.league_id = p_league_id
        GROUP BY dp.fantasy_team_id
        HAVING COUNT(*) <> 4
    ) THEN
        RAISE EXCEPTION 'Each fantasy team must receive exactly 4 NFL teams';
    END IF;

    UPDATE draft_picks dp
    SET nfl_team_id = ip.nfl_team_id,
        picked_at = NOW(),
        is_auto = FALSE
    FROM _offline_picks ip
    WHERE dp.league_id = p_league_id
      AND dp.pick_number = ip.pick_number;

    INSERT INTO fantasy_team_rosters (
        league_id, fantasy_team_id, nfl_team_id, acquired_via, draft_pick_number
    )
    SELECT dp.league_id, dp.fantasy_team_id, dp.nfl_team_id, 'commissioner', dp.pick_number
    FROM draft_picks dp
    WHERE dp.league_id = p_league_id;

    UPDATE leagues
    SET draft_status = 'complete',
        draft_current_pick = NULL,
        draft_pick_deadline = NULL,
        draft_paused = FALSE
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'FINALIZE',
        'draft',
        p_league_id,
        jsonb_build_object('pick_count', 32, 'draft_mode', 'offline')
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_offline_draft_picks TO authenticated;

COMMENT ON FUNCTION set_offline_draft_picks IS
    'Finalize an offline draft: write all 32 picks and rosters in one step (owner only)';

-- ============================================================
-- draft_execute_pick: refuse offline
-- ============================================================

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

    IF league_mode = 'offline' THEN
        RAISE EXCEPTION 'Offline drafts are assigned by the commissioner in one step';
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
    SET nfl_team_id = p_nfl_team_id, picked_at = NOW(), is_auto = p_is_auto
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

-- ============================================================
-- my_pick stays off for offline assignment
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
        AND l.draft_mode IS DISTINCT FROM 'offline'
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
    l.draft_paused,
    l.draft_format
FROM leagues l
JOIN league_members lm ON l.id = lm.league_id
WHERE lm.user_id = auth.uid();

GRANT SELECT ON v_user_leagues TO authenticated;
