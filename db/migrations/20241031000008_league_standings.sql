-- League standings: score columns on league_matchups + v_league_standings view
--
-- The clean schema stored no scores on league_matchups; standings need them.
-- Scores stay NULL until Phase 4's finalize_week_scores populates them.

-- Step 1: Add score columns to league_matchups
ALTER TABLE league_matchups ADD COLUMN IF NOT EXISTS team1_score NUMERIC;
ALTER TABLE league_matchups ADD COLUMN IF NOT EXISTS team2_score NUMERIC;
ALTER TABLE league_matchups ADD COLUMN IF NOT EXISTS is_complete BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN league_matchups.team1_score IS 'Recorded score for fantasy_team1 (NULL until week finalized)';
COMMENT ON COLUMN league_matchups.team2_score IS 'Recorded score for fantasy_team2 (NULL until week finalized)';
COMMENT ON COLUMN league_matchups.is_complete IS 'TRUE once scores are recorded for this matchup';

-- Step 2: Standings view
-- security_invoker so the querying user's RLS on league_matchups /
-- fantasy_teams applies (members only see their own leagues).
CREATE OR REPLACE VIEW v_league_standings
WITH (security_invoker = true)
AS
WITH matchup_results AS (
    -- one row per team per completed matchup
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
    GROUP BY ft.league_id, ft.id, ft.team_name, ft.manager_user_id
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
        ORDER BY tr.wins DESC, tr.points_for DESC, tr.team_name
    ) AS rank
FROM team_records tr;

GRANT SELECT ON v_league_standings TO authenticated;

COMMENT ON VIEW v_league_standings IS 'W-L-T, points for/against, and rank per fantasy team, derived from completed league_matchups';

-- Verification (run in SQL editor):
--
--   -- A scheduled league with no recorded scores returns one 0-0-0 row per team:
--   SELECT * FROM v_league_standings WHERE league_id = '<league-id>' ORDER BY rank;
