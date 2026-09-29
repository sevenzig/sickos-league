-- Minimum starts display: count finalized regular-season starts per rostered NFL team.
-- Gates: weeks.is_locked = true AND fl.week <= leagues.regular_season_weeks.
-- Playoff weeks and unlocked (saved-only) lineups do not count.

CREATE OR REPLACE FUNCTION get_fantasy_team_start_counts(p_fantasy_team_id UUID)
RETURNS TABLE (
    nfl_team_id UUID,
    starts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_league_id UUID;
    rs_weeks SMALLINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT ft.league_id, l.regular_season_weeks
    INTO team_league_id, rs_weeks
    FROM fantasy_teams ft
    JOIN leagues l ON l.id = ft.league_id
    WHERE ft.id = p_fantasy_team_id;

    IF team_league_id IS NULL THEN
        RAISE EXCEPTION 'Fantasy team not found';
    END IF;

    IF NOT is_league_member(team_league_id) THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        ftr.nfl_team_id,
        COALESCE(c.starts, 0)::INTEGER AS starts
    FROM fantasy_team_rosters ftr
    LEFT JOIN (
        SELECT
            starter.nfl_id AS nfl_team_id,
            COUNT(*)::INTEGER AS starts
        FROM fantasy_lineups fl
        JOIN weeks w
          ON w.league_id = team_league_id
         AND w.week_number = fl.week
         AND w.is_locked = TRUE
        CROSS JOIN LATERAL unnest(fl.active_nfl_teams) AS starter(nfl_id)
        WHERE fl.fantasy_team_id = p_fantasy_team_id
          AND fl.week BETWEEN 1 AND rs_weeks
        GROUP BY starter.nfl_id
    ) c ON c.nfl_team_id = ftr.nfl_team_id
    WHERE ftr.fantasy_team_id = p_fantasy_team_id
    ORDER BY ftr.draft_pick_number NULLS LAST, ftr.nfl_team_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_fantasy_team_start_counts(UUID) TO authenticated;

COMMENT ON FUNCTION get_fantasy_team_start_counts IS
  'Per-roster NFL start counts for one fantasy team. Counts only weeks with weeks.is_locked and week <= regular_season_weeks; unlocked and playoff lineups excluded.';
