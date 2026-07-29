-- Auto-pick for unmanaged fantasy teams (bots: manager_user_id IS NULL).
-- Same rule as live timeout: alphabetically first remaining NFL team.
-- Runs on get_draft_state (client poll) and draft_tick_all (server cron).

CREATE OR REPLACE FUNCTION draft_auto_pick_bots(p_league_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    n INTEGER := 0;
    league_status TEXT;
    league_paused BOOLEAN;
    current_pick INTEGER;
    manager_id UUID;
    auto_nfl_id UUID;
BEGIN
    LOOP
        SELECT l.draft_status, l.draft_paused, l.draft_current_pick
        INTO league_status, league_paused, current_pick
        FROM leagues l
        WHERE l.id = p_league_id
        FOR UPDATE;

        EXIT WHEN NOT FOUND
            OR league_status IS DISTINCT FROM 'in_progress'
            OR league_paused
            OR current_pick IS NULL;

        SELECT ft.manager_user_id
        INTO manager_id
        FROM draft_picks dp
        JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
        WHERE dp.league_id = p_league_id
          AND dp.pick_number = current_pick;

        -- Human (or missing pick row) on the clock — stop
        EXIT WHEN manager_id IS NOT NULL;

        SELECT t.uuid_id INTO auto_nfl_id
        FROM teams t
        WHERE t.is_nfl
          AND NOT EXISTS (
              SELECT 1 FROM draft_picks dp
              WHERE dp.league_id = p_league_id AND dp.nfl_team_id = t.uuid_id
          )
        ORDER BY t.name
        LIMIT 1;

        EXIT WHEN auto_nfl_id IS NULL;

        PERFORM draft_execute_pick(p_league_id, auto_nfl_id, FALSE, TRUE);
        n := n + 1;

        -- Safety: never loop forever if something goes wrong
        EXIT WHEN n >= 32;
    END LOOP;

    RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_auto_pick_bots FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_auto_pick_bots FROM authenticated;

-- Wire into live tick (covers idle rooms with no client polling)
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
        WHILE draft_expire_current_pick(r.id) LOOP
            n := n + 1;
        END LOOP;
        n := n + draft_auto_pick_bots(r.id);
    END LOOP;

    -- Async drafts: still advance bot picks when cron runs
    FOR r IN
        SELECT l.id
        FROM leagues l
        WHERE l.draft_mode = 'async'
          AND l.draft_status = 'in_progress'
          AND COALESCE(l.draft_paused, FALSE) = FALSE
    LOOP
        n := n + draft_auto_pick_bots(r.id);
    END LOOP;

    RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_tick_all FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_tick_all FROM authenticated;
GRANT EXECUTE ON FUNCTION draft_tick_all TO service_role;

-- Wire into get_draft_state so client polls advance bots immediately
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

COMMENT ON FUNCTION draft_auto_pick_bots IS
    'While the on-clock fantasy team has no manager (bot), auto-pick the alphabetically first remaining NFL team';
