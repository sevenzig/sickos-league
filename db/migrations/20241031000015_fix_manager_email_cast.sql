-- Fix: get_league_fantasy_teams and get_fantasy_lineups_for_week declare
-- manager_email TEXT but select auth.users.email, which is VARCHAR(255) in
-- the self-hosted bootstrap shim. Postgres rejects the mismatch at runtime
-- ("structure of query does not match function result type", 42804).
-- Cast to TEXT; bodies otherwise identical to 20241031000003 / 20241029000202.

CREATE OR REPLACE FUNCTION get_league_fantasy_teams(p_league_id UUID)
RETURNS TABLE (
    id UUID,
    league_id UUID,
    team_name TEXT,
    manager_user_id UUID,
    manager_email TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.league_id,
        ft.team_name,
        ft.manager_user_id,
        u.email::TEXT as manager_email,
        ft.created_at
    FROM fantasy_teams ft
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE ft.league_id = p_league_id
    ORDER BY ft.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_fantasy_teams TO authenticated;

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

CREATE OR REPLACE FUNCTION get_league_schedule(
    p_league_id UUID,
    p_week INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    week INTEGER,
    fantasy_team1_id UUID,
    fantasy_team1_name TEXT,
    team1_manager_email TEXT,
    fantasy_team2_id UUID,
    fantasy_team2_name TEXT,
    team2_manager_email TEXT,
    locks_at TIMESTAMPTZ,
    week_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        lm.id,
        lm.week,
        lm.fantasy_team1_id,
        ft1.team_name as fantasy_team1_name,
        u1.email::TEXT as team1_manager_email,
        lm.fantasy_team2_id,
        ft2.team_name as fantasy_team2_name,
        u2.email::TEXT as team2_manager_email,
        w.locks_at,
        COALESCE(w.is_locked, FALSE) as week_locked
    FROM league_matchups lm
    JOIN fantasy_teams ft1 ON lm.fantasy_team1_id = ft1.id
    JOIN fantasy_teams ft2 ON lm.fantasy_team2_id = ft2.id
    LEFT JOIN auth.users u1 ON ft1.manager_user_id = u1.id
    LEFT JOIN auth.users u2 ON ft2.manager_user_id = u2.id
    LEFT JOIN weeks w ON lm.league_id = w.league_id AND lm.week = w.week_number
    WHERE lm.league_id = p_league_id
      AND (p_week IS NULL OR lm.week = p_week)
    ORDER BY lm.week, lm.id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_schedule TO authenticated;
