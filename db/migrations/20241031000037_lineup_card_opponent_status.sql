-- Lineup card UI: preserve home/away on NFL kickoff upsert + expose opponent
-- on get_nfl_week_team_status for Option 5 (@ / vs) meta.
--
-- Convention (matches scripts/sync-nfl-kickoffs-espn.mjs):
--   team1 = away, team2 = home.
-- Existing rows written with id-ordered pairs stay wrong for @/vs until re-sync.

-- ---------------------------------------------------------------------------
-- upsert_nfl_kickoff_times: keep payload team1/team2 order (away/home)
-- ---------------------------------------------------------------------------
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

        -- Find existing row by unordered pair; write sides as provided (away/home).
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
            VALUES (p_week, id1, id2, ts);
        ELSE
            DELETE FROM matchups m
            WHERE m.week = p_week
              AND m.id <> keep_id
              AND (
                  (m.team1_id = lo AND m.team2_id = hi)
                  OR (m.team1_id = hi AND m.team2_id = lo)
              );
            UPDATE matchups
            SET team1_id = id1,
                team2_id = id2,
                game_time = ts
            WHERE id = keep_id;
        END IF;

        written := written + 1;
    END LOOP;

    RETURN written;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_nfl_kickoff_times(INTEGER, JSONB) TO authenticated;

COMMENT ON FUNCTION upsert_nfl_kickoff_times IS
  'Platform-admin upsert of NFL kickoffs into matchups.game_time; team1=away, team2=home (ESPN sync convention); idempotent on unordered (week, team pair).';

-- ---------------------------------------------------------------------------
-- get_nfl_week_team_status: add opponent + is_home for lineup cards
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_nfl_week_team_status(INTEGER);

CREATE OR REPLACE FUNCTION get_nfl_week_team_status(p_week INTEGER)
RETURNS TABLE(
    nfl_team_id UUID,
    game_time TIMESTAMPTZ,
    status TEXT,
    opponent_name TEXT,
    is_home BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        t.uuid_id AS nfl_team_id,
        playing.game_time,
        CASE WHEN playing.team_id IS NOT NULL THEN 'playing' ELSE 'bye' END AS status,
        playing.opponent_name,
        playing.is_home
    FROM teams t
    LEFT JOIN LATERAL (
        SELECT
            t.id AS team_id,
            m.game_time,
            CASE
                WHEN m.team1_id = t.id THEN opp.name
                WHEN m.team2_id = t.id THEN opp.name
                ELSE NULL
            END AS opponent_name,
            (m.team2_id = t.id) AS is_home
        FROM matchups m
        JOIN teams opp
          ON opp.id = CASE
              WHEN m.team1_id = t.id THEN m.team2_id
              ELSE m.team1_id
          END
        WHERE m.week = p_week
          AND (m.team1_id = t.id OR m.team2_id = t.id)
        ORDER BY m.game_time NULLS LAST
        LIMIT 1
    ) playing ON TRUE
    WHERE t.is_nfl
      AND EXISTS (
          SELECT 1 FROM matchups m2
          WHERE m2.week = p_week AND m2.game_time IS NOT NULL
      )
    ORDER BY t.uuid_id;
$$;

GRANT EXECUTE ON FUNCTION get_nfl_week_team_status(INTEGER) TO authenticated;

COMMENT ON FUNCTION get_nfl_week_team_status IS
  'When week N has at least one matchups.game_time, returns all 32 NFL teams as playing (kickoff, opponent_name, is_home) or bye. Empty when not seeded. is_home true when team is matchups.team2 (home).';
