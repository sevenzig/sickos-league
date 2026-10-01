-- Harden get_fantasy_lineups_for_week against VARCHAR[] vs TEXT[] mismatches
-- (teams.name is VARCHAR(50); RETURNS TABLE declares TEXT[]). Same class of
-- bug as 20241031000015_fix_manager_email_cast.sql. Also pin search_path
-- on the SECURITY DEFINER function (mirror get_nfl_week_team_status).
--
-- DROP + CREATE required: CREATE OR REPLACE VIEW cannot change column type
-- from character varying[] to text[].

DROP FUNCTION IF EXISTS get_fantasy_lineups_for_week(UUID, INTEGER);
DROP VIEW IF EXISTS v_fantasy_lineups;

CREATE VIEW v_fantasy_lineups AS
SELECT
    fl.id,
    fl.fantasy_team_id,
    ft.team_name AS fantasy_team_name,
    ft.league_id,
    l.name AS league_name,
    fl.week,
    fl.active_nfl_teams,
    COALESCE(
        ARRAY(
            SELECT t.name::TEXT
            FROM unnest(fl.active_nfl_teams) WITH ORDINALITY AS nfl_id(id, ord)
            JOIN teams t ON t.uuid_id = nfl_id.id
            ORDER BY nfl_id.ord
        ),
        ARRAY[]::TEXT[]
    ) AS active_nfl_team_names,
    fl.is_locked,
    w.is_locked AS week_locked,
    w.locks_at,
    fl.created_at,
    fl.updated_at
FROM fantasy_lineups fl
JOIN fantasy_teams ft ON fl.fantasy_team_id = ft.id
JOIN leagues l ON ft.league_id = l.id
LEFT JOIN weeks w ON w.league_id = ft.league_id AND w.week_number = fl.week;

GRANT SELECT ON v_fantasy_lineups TO authenticated;

CREATE FUNCTION get_fantasy_lineups_for_week(
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
SET search_path = public, auth
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
        vfl.fantasy_team_name::TEXT,
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
