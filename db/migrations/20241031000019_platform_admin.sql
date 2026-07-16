-- Phase 6.3: platform-admin role distinct from league commissioner.
-- Grants are set by the operator via SQL (no self-serve path).

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION auth.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT COALESCE(
        (SELECT is_platform_admin FROM auth.users WHERE id = auth.uid()),
        false
    );
$$;

GRANT EXECUTE ON FUNCTION auth.is_platform_admin() TO anon, authenticated, service_role;

-- finalize_week_scores: platform-admin only (was any authenticated user)
CREATE OR REPLACE FUNCTION finalize_week_scores(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2025
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

    IF NOT auth.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform admin required';
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

COMMENT ON FUNCTION finalize_week_scores IS
    'Persist matchup scores for a week across all leagues with that week locked; platform-admin only; idempotent';
