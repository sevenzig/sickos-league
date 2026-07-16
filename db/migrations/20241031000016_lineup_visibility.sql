-- Phase 3.1: hide other managers' lineup contents until the week locks
-- (standard fantasy convention, enforced server-side). Callers always see
-- their own lineup; league owners see everything. Lock flags stay visible so
-- the UI can show submission status.
--
-- Body otherwise identical to 20241031000015_fix_manager_email_cast.sql
-- (keeps the ::TEXT cast on auth.users.email).

CREATE OR REPLACE FUNCTION get_fantasy_lineups_for_week(
    p_league_id UUID,
    p_week INTEGER
)
RETURNS TABLE (
    fantasy_team_id UUID,
    fantasy_team_name TEXT,
    manager_email TEXT,
    active_nfl_teams UUID[],
    active_nfl_team_names TEXT[],
    is_locked BOOLEAN,
    week_locked BOOLEAN
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
    WHERE lm.league_id = p_league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        vfl.fantasy_team_id,
        vfl.fantasy_team_name,
        u.email::TEXT,
        CASE WHEN COALESCE(vfl.week_locked, FALSE)
                  OR ft.manager_user_id = auth.uid()
                  OR user_role = 'owner'
             THEN COALESCE(vfl.active_nfl_teams, ARRAY[]::UUID[])
             ELSE ARRAY[]::UUID[]
        END,
        CASE WHEN COALESCE(vfl.week_locked, FALSE)
                  OR ft.manager_user_id = auth.uid()
                  OR user_role = 'owner'
             THEN COALESCE(vfl.active_nfl_team_names, ARRAY[]::TEXT[])
             ELSE ARRAY[]::TEXT[]
        END,
        COALESCE(vfl.is_locked, FALSE),
        COALESCE(vfl.week_locked, FALSE)
    FROM v_fantasy_lineups vfl
    JOIN fantasy_teams ft ON vfl.fantasy_team_id = ft.id
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE vfl.league_id = p_league_id
      AND vfl.week = p_week
    ORDER BY vfl.fantasy_team_name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_fantasy_lineups_for_week TO authenticated;

COMMENT ON FUNCTION get_fantasy_lineups_for_week IS 'Lineups for a week; other managers'' lineup contents are hidden until the week locks (owner sees all)';
