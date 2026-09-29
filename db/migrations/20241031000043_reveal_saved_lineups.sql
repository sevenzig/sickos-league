-- Reveal saved lineups to league members as soon as starters are set.
-- Previously other managers' picks stayed empty until the week locked.
-- Membership check unchanged; empty / unset lineups still return empty arrays.

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
        COALESCE(vfl.active_nfl_teams, ARRAY[]::UUID[]),
        COALESCE(vfl.active_nfl_team_names, ARRAY[]::TEXT[]),
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

COMMENT ON FUNCTION get_fantasy_lineups_for_week IS
  'Lineups for a week; members see saved starters as soon as they are set (week lock flags still returned)';
