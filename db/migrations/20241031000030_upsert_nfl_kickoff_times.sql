-- Prompt A1: write path for NFL kickoff times on legacy matchups.
--
-- 000029 added matchups.game_time + get_nfl_kickoff_times + set_fantasy_lineup
-- kickoff checks, but nothing could populate game_time: 000020 made matchups
-- SELECT-only (no platform-admin write policies). This SECURITY DEFINER RPC is
-- the minimal upsert path for weekly ops / verify seeding.

CREATE OR REPLACE FUNCTION upsert_nfl_kickoff_times(
    p_week INTEGER,
    p_games JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    g JSONB;
    name1 TEXT;
    name2 TEXT;
    ts TIMESTAMPTZ;
    id1 INTEGER;
    id2 INTEGER;
    lo INTEGER;
    hi INTEGER;
    keep_id INTEGER;
    written INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT auth.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform admin required';
    END IF;

    IF p_week IS NULL OR p_week < 1 THEN
        RAISE EXCEPTION 'Invalid week';
    END IF;

    IF p_games IS NULL OR jsonb_typeof(p_games) <> 'array' THEN
        RAISE EXCEPTION 'p_games must be a JSON array';
    END IF;

    FOR g IN SELECT * FROM jsonb_array_elements(p_games)
    LOOP
        name1 := NULLIF(trim(g->>'team1'), '');
        name2 := NULLIF(trim(g->>'team2'), '');
        IF name1 IS NULL OR name2 IS NULL THEN
            RAISE EXCEPTION 'Each game requires team1 and team2 names';
        END IF;
        IF name1 = name2 THEN
            RAISE EXCEPTION 'team1 and team2 must differ (% vs %)', name1, name2;
        END IF;

        IF g->>'game_time' IS NULL OR trim(g->>'game_time') = '' THEN
            RAISE EXCEPTION 'Each game requires game_time';
        END IF;
        BEGIN
            ts := (g->>'game_time')::TIMESTAMPTZ;
        EXCEPTION WHEN others THEN
            RAISE EXCEPTION 'Invalid game_time for % vs %: %', name1, name2, g->>'game_time';
        END;

        SELECT t.id INTO id1
        FROM teams t
        WHERE t.name = name1 AND t.is_nfl
        LIMIT 1;
        IF id1 IS NULL THEN
            RAISE EXCEPTION 'Unknown NFL team: %', name1;
        END IF;

        SELECT t.id INTO id2
        FROM teams t
        WHERE t.name = name2 AND t.is_nfl
        LIMIT 1;
        IF id2 IS NULL THEN
            RAISE EXCEPTION 'Unknown NFL team: %', name2;
        END IF;

        -- Canonicalize pair order so re-imports with swapped sides do not duplicate.
        lo := LEAST(id1, id2);
        hi := GREATEST(id1, id2);

        SELECT MIN(m.id) INTO keep_id
        FROM matchups m
        WHERE m.week = p_week
          AND (
              (m.team1_id = lo AND m.team2_id = hi)
              OR (m.team1_id = hi AND m.team2_id = lo)
          );

        IF keep_id IS NULL THEN
            INSERT INTO matchups (week, team1_id, team2_id, game_time)
            VALUES (p_week, lo, hi, ts);
        ELSE
            DELETE FROM matchups m
            WHERE m.week = p_week
              AND (
                  (m.team1_id = lo AND m.team2_id = hi)
                  OR (m.team1_id = hi AND m.team2_id = lo)
              )
              AND m.id <> keep_id;

            UPDATE matchups
            SET team1_id = lo, team2_id = hi, game_time = ts
            WHERE id = keep_id;
        END IF;

        written := written + 1;
    END LOOP;

    RETURN written;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_nfl_kickoff_times(INTEGER, JSONB) TO authenticated;

COMMENT ON FUNCTION upsert_nfl_kickoff_times IS
  'Platform-admin upsert of NFL schedule kickoffs into matchups.game_time for a week; idempotent on (week, team pair).';
