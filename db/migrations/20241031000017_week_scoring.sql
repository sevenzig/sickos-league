-- Phase 4: Scoring, matchups, standings - wire game_stats into league_matchups.
--
-- Mapping (Phase 4.1): the CSV importer (src/services/csvImporter.ts) already
-- normalizes abbreviations to full team names via teamNameMap in
-- src/utils/csvParser.ts, so game_stats.team_abbr holds full names matching
-- teams.name exactly. The scoring join is:
--   lineup UUID -> teams.uuid_id -> teams.name -> game_stats.team_abbr
-- scripts/verify-phase4.mjs round-trips all 32 teams through this chain.

-- ============================================================
-- compute_lineup_score: one fantasy team's score for a week.
-- NULL (never 0) when the lineup is missing, empty, not locked, or any
-- lineup team lacks a game_stats row for that week/season.
-- Internal helper - called only from SECURITY DEFINER RPCs, no client grant.
-- ============================================================
CREATE OR REPLACE FUNCTION compute_lineup_score(
    p_fantasy_team_id UUID,
    p_week INTEGER,
    p_season INTEGER
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    lineup UUID[];
    locked BOOLEAN;
    matched INTEGER;
    total NUMERIC;
BEGIN
    SELECT
        fl.active_nfl_teams,
        (COALESCE(fl.is_locked, FALSE) OR COALESCE(w.is_locked, FALSE))
    INTO lineup, locked
    FROM fantasy_lineups fl
    JOIN fantasy_teams ft ON ft.id = fl.fantasy_team_id
    LEFT JOIN weeks w ON w.league_id = ft.league_id AND w.week_number = fl.week
    WHERE fl.fantasy_team_id = p_fantasy_team_id
      AND fl.week = p_week;

    IF lineup IS NULL OR array_length(lineup, 1) IS NULL OR NOT locked THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*), SUM(gs.final_score)
    INTO matched, total
    FROM unnest(lineup) AS l(nfl_id)
    JOIN teams t ON t.uuid_id = l.nfl_id
    JOIN game_stats gs
        ON gs.team_abbr = t.name
       AND gs.week = p_week
       AND gs.season = p_season;

    -- Partial stats must not finalize as a partial sum
    IF matched < array_length(lineup, 1) THEN
        RETURN NULL;
    END IF;

    RETURN total;
END;
$$;

-- Internal only (Postgres grants EXECUTE to PUBLIC by default)
REVOKE EXECUTE ON FUNCTION compute_lineup_score FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION compute_lineup_score FROM authenticated;

COMMENT ON FUNCTION compute_lineup_score IS 'Sum of game_stats.final_score for a fantasy team''s locked lineup; NULL when lineup or stats are missing (internal helper)';

-- ============================================================
-- finalize_week_scores: persist scores onto league_matchups for ALL leagues
-- at once (one site-wide CSV upload serves every league). Idempotent -
-- recomputes from current game_stats, so a corrected re-import flows through.
-- Only matchups in leagues whose week is locked and where both sides are
-- scoreable are finalized; the rest stay NULL / incomplete.
-- Any authenticated user may call it: the result is deterministic, derived
-- entirely from locked lineups and imported stats (a platform-admin role is
-- deferred to Phase 6.3).
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_week_scores(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2025
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    m RECORD;
    s1 NUMERIC;
    s2 NUMERIC;
    finalized INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    FOR m IN
        SELECT lm.id, lm.fantasy_team1_id, lm.fantasy_team2_id
        FROM league_matchups lm
        JOIN leagues l ON l.id = lm.league_id AND l.season = p_season
        JOIN weeks w ON w.league_id = lm.league_id
                    AND w.week_number = lm.week
                    AND w.is_locked
        WHERE lm.week = p_week
    LOOP
        s1 := compute_lineup_score(m.fantasy_team1_id, p_week, p_season);
        s2 := compute_lineup_score(m.fantasy_team2_id, p_week, p_season);

        IF s1 IS NOT NULL AND s2 IS NOT NULL THEN
            UPDATE league_matchups
            SET team1_score = s1,
                team2_score = s2,
                is_complete = TRUE
            WHERE id = m.id;
            finalized := finalized + 1;
        END IF;
    END LOOP;

    RETURN finalized;
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_week_scores TO authenticated;

COMMENT ON FUNCTION finalize_week_scores IS 'Persist matchup scores for a week across all leagues with that week locked; idempotent, returns matchups finalized';

-- ============================================================
-- get_league_schedule: extended to return the persisted scores so the UI
-- reads matchups + scores in one call. DROP first - the return type changes,
-- which CREATE OR REPLACE rejects. Body otherwise identical to
-- 20241031000015_fix_manager_email_cast.sql (keeps the ::TEXT email casts).
-- ============================================================
DROP FUNCTION IF EXISTS get_league_schedule(UUID, INTEGER);

CREATE FUNCTION get_league_schedule(
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
    week_locked BOOLEAN,
    team1_score NUMERIC,
    team2_score NUMERIC,
    is_complete BOOLEAN
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
        COALESCE(w.is_locked, FALSE) as week_locked,
        lm.team1_score,
        lm.team2_score,
        lm.is_complete
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

COMMENT ON FUNCTION get_league_schedule IS 'Get schedule for a league with optional week filter, including persisted matchup scores';

-- Verification (run scripts/verify-phase4.mjs against docker compose up), or in SQL:
--
--   -- Round-trip: every teams row has a game_stats row for the imported week:
--   SELECT t.name FROM teams t
--   LEFT JOIN game_stats gs ON gs.team_abbr = t.name AND gs.week = 1 AND gs.season = 2025
--   WHERE gs.id IS NULL;                          -- expect 0 rows after an import
--
--   -- Finalize and check persisted scores match hand-computed lineup sums:
--   SELECT finalize_week_scores(1, 2025);
--   SELECT * FROM get_league_schedule('<league-id>', 1);
