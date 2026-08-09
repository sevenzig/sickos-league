-- Draft format: snake (default) vs linear pick order.
-- Sequence is baked into draft_picks at start_draft time.

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS draft_format TEXT NOT NULL DEFAULT 'snake';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'leagues_draft_format_check' AND table_name = 'leagues'
    ) THEN
        ALTER TABLE leagues ADD CONSTRAINT leagues_draft_format_check
            CHECK (draft_format IN ('snake', 'linear'));
    END IF;
END $$;

COMMENT ON COLUMN leagues.draft_format IS 'snake | linear — how round-1 order expands across rounds';

-- ============================================================
-- create_league: accept draft_format
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

    fmt := COALESCE(p_draft_format, 'snake');
    IF fmt NOT IN ('snake', 'linear') THEN
        RAISE EXCEPTION 'draft_format must be snake or linear';
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
        draft_mode, draft_at, draft_pick_seconds, draft_format
    )
    VALUES (
        league_name, season, teams_started_per_week, current_user_id,
        mode, p_draft_at, pick_secs, fmt
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
            'draft_pick_seconds', pick_secs,
            'draft_format', fmt
        )
    );

    RETURN new_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_league TO authenticated;

COMMENT ON FUNCTION create_league IS
    'Create a league with draft mode (async|live) and format (snake|linear). Live requires draft_at.';

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
-- start_draft: expand round-1 order via draft_format
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

COMMENT ON FUNCTION start_draft IS
  'Start the draft: pre-create 32 pick slots (snake or linear); auto-generate schedule if none exists (owner or live autostart)';

-- ============================================================
-- get_draft_state: include draft_format
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
    PERFORM draft_auto_pick_bots(p_league_id);

    SELECT jsonb_build_object(
        'draft_status', l.draft_status,
        'draft_mode', l.draft_mode,
        'draft_format', l.draft_format,
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
                'picked_at', dp.picked_at,
                'is_auto', dp.is_auto
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

-- ============================================================
-- League list/details: expose draft_format
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
    l.draft_paused,
    l.draft_format
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
    draft_paused BOOLEAN,
    draft_format TEXT
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
    draft_paused BOOLEAN,
    draft_format TEXT
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
