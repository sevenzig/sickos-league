-- Week-lock RPCs promoted from migrations/backup/ into the active schema.
--
-- set_week_lock:  ported from backup/20241029000007 (touches only weeks + audit_logs).
-- get_week_status: rewritten against the clean schema - lineup counts come from
--   fantasy_lineups / fantasy_teams instead of the legacy lineups / league_teams /
--   team_slots tables.
-- Parameter names match the existing client calls in src/utils/multiLeagueApi.ts.

-- Function to set week lock time
CREATE OR REPLACE FUNCTION set_week_lock(
    league_id UUID,
    week_number INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = set_week_lock.league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can manage week locks';
    END IF;

    -- Update or insert week lock settings
    INSERT INTO weeks (league_id, week_number, locks_at, is_locked)
    VALUES (set_week_lock.league_id, set_week_lock.week_number, set_week_lock.locks_at, set_week_lock.is_locked)
    ON CONFLICT (league_id, week_number)
    DO UPDATE SET
        locks_at = EXCLUDED.locks_at,
        is_locked = EXCLUDED.is_locked;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        set_week_lock.league_id,
        auth.uid(),
        'UPDATE',
        'week',
        NULL,
        jsonb_build_object(
            'week_number', set_week_lock.week_number,
            'locks_at', set_week_lock.locks_at,
            'is_locked', set_week_lock.is_locked
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to get week lock status
CREATE OR REPLACE FUNCTION get_week_status(
    league_id UUID,
    week_number INTEGER
)
RETURNS TABLE (
    week INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN,
    lineups_submitted INTEGER,
    total_teams INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_week_status.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        w.week_number,
        w.locks_at,
        COALESCE(w.is_locked, FALSE),
        (
            SELECT COUNT(*)::INTEGER
            FROM fantasy_lineups fl
            JOIN fantasy_teams ft ON fl.fantasy_team_id = ft.id
            WHERE ft.league_id = get_week_status.league_id
              AND fl.week = get_week_status.week_number
              AND fl.active_nfl_teams IS NOT NULL
              AND array_length(fl.active_nfl_teams, 1) > 0
        ),
        (
            SELECT COUNT(*)::INTEGER
            FROM fantasy_teams ft
            WHERE ft.league_id = get_week_status.league_id
        )
    FROM weeks w
    WHERE w.league_id = get_week_status.league_id
      AND w.week_number = get_week_status.week_number;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION set_week_lock TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_status TO authenticated;

COMMENT ON FUNCTION set_week_lock IS 'Set lock time/status for a week (league owners only)';
COMMENT ON FUNCTION get_week_status IS 'Get lock status and lineup submission counts for a week (league members only)';
