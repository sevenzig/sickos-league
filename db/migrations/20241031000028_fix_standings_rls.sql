-- Fix RLS recursion reintroduced by 20241031000021_tighten_member_rls.sql.
-- That migration replaced is_league_member(...) checks with
--   league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
-- which self-references league_members under RLS → 42P17 infinite recursion.
-- Direct selects on fantasy_teams / v_league_standings / etc. all fail.
--
-- Also: rank standings by draft_order when W-L-T / PF are tied (pre-season 0-0).

-- Ensure helper still exists (from 20241031000011)
CREATE OR REPLACE FUNCTION is_league_member(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION is_league_member TO authenticated, anon;

-- leagues
DROP POLICY IF EXISTS leagues_member_select ON leagues;
DROP POLICY IF EXISTS leagues_member_access ON leagues;
CREATE POLICY leagues_member_select ON leagues
    FOR SELECT USING (is_league_member(id));

-- league_members (no self-referencing subquery)
DROP POLICY IF EXISTS league_members_select ON league_members;
DROP POLICY IF EXISTS league_members_access ON league_members;
DROP POLICY IF EXISTS league_members_own_rows ON league_members;
DROP POLICY IF EXISTS league_members_same_league ON league_members;
CREATE POLICY league_members_own_rows ON league_members
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY league_members_same_league ON league_members
    FOR SELECT USING (is_league_member(league_id));

-- fantasy_teams
DROP POLICY IF EXISTS fantasy_teams_select ON fantasy_teams;
DROP POLICY IF EXISTS fantasy_teams_league_access ON fantasy_teams;
CREATE POLICY fantasy_teams_select ON fantasy_teams
    FOR SELECT USING (is_league_member(league_id));

-- league_matchups
DROP POLICY IF EXISTS league_matchups_select ON league_matchups;
DROP POLICY IF EXISTS league_matchups_access ON league_matchups;
CREATE POLICY league_matchups_select ON league_matchups
    FOR SELECT USING (is_league_member(league_id));

-- weeks
DROP POLICY IF EXISTS weeks_select ON weeks;
DROP POLICY IF EXISTS weeks_league_access ON weeks;
CREATE POLICY weeks_select ON weeks
    FOR SELECT USING (is_league_member(league_id));

-- audit_logs
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
DROP POLICY IF EXISTS audit_logs_league_access ON audit_logs;
DROP POLICY IF EXISTS audit_logs_actor_access ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (
        (league_id IS NOT NULL AND is_league_member(league_id))
        OR user_id = auth.uid()
        OR auth.is_platform_admin()
    );

-- Standings: include all teams (0-0 when no completed matchups);
-- tie-break by leagues.draft_order so pre-season order matches the draft.
CREATE OR REPLACE VIEW v_league_standings
WITH (security_invoker = true)
AS
WITH matchup_results AS (
    SELECT
        lm.league_id,
        lm.fantasy_team1_id AS fantasy_team_id,
        lm.team1_score AS points_for,
        lm.team2_score AS points_against
    FROM league_matchups lm
    WHERE lm.is_complete
      AND lm.team1_score IS NOT NULL
      AND lm.team2_score IS NOT NULL
    UNION ALL
    SELECT
        lm.league_id,
        lm.fantasy_team2_id,
        lm.team2_score,
        lm.team1_score
    FROM league_matchups lm
    WHERE lm.is_complete
      AND lm.team1_score IS NOT NULL
      AND lm.team2_score IS NOT NULL
),
team_records AS (
    SELECT
        ft.league_id,
        ft.id AS fantasy_team_id,
        ft.team_name,
        ft.manager_user_id,
        ft.logo_url,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for > mr.points_against)::INTEGER AS wins,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for < mr.points_against)::INTEGER AS losses,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for = mr.points_against)::INTEGER AS ties,
        COALESCE(SUM(mr.points_for), 0) AS points_for,
        COALESCE(SUM(mr.points_against), 0) AS points_against,
        COUNT(mr.fantasy_team_id)::INTEGER AS games_played
    FROM fantasy_teams ft
    LEFT JOIN matchup_results mr
        ON mr.league_id = ft.league_id
       AND mr.fantasy_team_id = ft.id
    GROUP BY ft.league_id, ft.id, ft.team_name, ft.manager_user_id, ft.logo_url
)
SELECT
    tr.league_id,
    tr.fantasy_team_id,
    tr.team_name,
    tr.manager_user_id,
    tr.wins,
    tr.losses,
    tr.ties,
    tr.points_for,
    tr.points_against,
    tr.games_played,
    CASE WHEN tr.games_played > 0
         THEN ROUND((tr.wins + 0.5 * tr.ties)::NUMERIC / tr.games_played, 3)
         ELSE 0 END AS win_percentage,
    ROW_NUMBER() OVER (
        PARTITION BY tr.league_id
        ORDER BY
            tr.wins DESC,
            tr.points_for DESC,
            COALESCE(array_position(l.draft_order, tr.fantasy_team_id), 2147483647),
            tr.team_name
    ) AS rank,
    tr.logo_url
FROM team_records tr
LEFT JOIN leagues l ON l.id = tr.league_id;

GRANT SELECT ON v_league_standings TO authenticated;

COMMENT ON VIEW v_league_standings IS
  'W-L-T per fantasy team; 0-0 before scores. Rank ties broken by draft_order then name.';
