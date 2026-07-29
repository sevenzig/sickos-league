-- Persist whether a draft pick was auto-picked (timeout or bot) so the
-- client can tell users "you missed the clock" instead of silently
-- showing a team they never chose.

ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS is_auto BOOLEAN NOT NULL DEFAULT FALSE;

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
