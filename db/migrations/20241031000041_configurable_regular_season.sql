-- Configurable regular season length: 14, 15, or 16 weeks.
-- Playoff field: 4, 5, or 6 only (8 coerced to 6). RS=16 requires playoff field 4.
-- Schedule cycle wraps: week 15 ≡ week 1, week 16 ≡ week 2 (no flip); 8–14 flip 1–7.

-- ============================================================
-- Schema: coerce playoff 8→6, relax checks
-- ============================================================

-- Larger-field default when retiring 8-team playoffs.
UPDATE leagues SET playoff_teams = 6 WHERE playoff_teams = 8;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_playoff_teams_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_playoff_teams_check
    CHECK (playoff_teams IN (4, 5, 6));

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_regular_season_weeks_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_regular_season_weeks_check
    CHECK (regular_season_weeks IN (14, 15, 16));

COMMENT ON COLUMN leagues.playoff_teams IS
    'Playoff field: 4, 5, or 6. Locked once a playoff matchup exists. RS=16 requires 4.';
COMMENT ON COLUMN leagues.regular_season_weeks IS
    'Regular season length: 14, 15, or 16. Playoffs start at regular_season_weeks + 1.';

-- ============================================================
-- create_league: optional p_regular_season_weeks (default 14)
-- ============================================================

DROP FUNCTION IF EXISTS create_league(TEXT, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT, SMALLINT, TEXT);

CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1,
    owner_team_name TEXT DEFAULT NULL,
    p_draft_mode TEXT DEFAULT 'async',
    p_draft_at TIMESTAMPTZ DEFAULT NULL,
    p_draft_pick_seconds INTEGER DEFAULT 90,
    p_draft_format TEXT DEFAULT 'snake',
    p_playoff_teams SMALLINT DEFAULT 4,
    p_standings_tiebreaker TEXT DEFAULT 'record_then_points',
    p_regular_season_weeks SMALLINT DEFAULT 14
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_league_id UUID;
    current_user_id UUID;
    current_user_email TEXT;
    default_team_name TEXT;
    mode TEXT;
    pick_secs INTEGER;
    fmt TEXT;
    stored_at TIMESTAMPTZ;
    playoff_n SMALLINT;
    tiebreaker TEXT;
    rs_weeks SMALLINT;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    mode := COALESCE(p_draft_mode, 'async');
    IF mode NOT IN ('async', 'live', 'offline') THEN
        RAISE EXCEPTION 'draft_mode must be async, live, or offline';
    END IF;

    pick_secs := COALESCE(p_draft_pick_seconds, 90);
    IF pick_secs NOT IN (30, 60, 90) THEN
        RAISE EXCEPTION 'draft_pick_seconds must be 30, 60, or 90';
    END IF;

    fmt := COALESCE(p_draft_format, 'snake');
    IF fmt NOT IN ('snake', 'linear') THEN
        RAISE EXCEPTION 'draft_format must be snake or linear';
    END IF;

    playoff_n := COALESCE(p_playoff_teams, 4);
    IF playoff_n NOT IN (4, 5, 6) THEN
        RAISE EXCEPTION 'playoff_teams must be 4, 5, or 6';
    END IF;

    rs_weeks := COALESCE(p_regular_season_weeks, 14);
    IF rs_weeks NOT IN (14, 15, 16) THEN
        RAISE EXCEPTION 'regular_season_weeks must be 14, 15, or 16';
    END IF;

    IF rs_weeks = 16 AND playoff_n <> 4 THEN
        RAISE EXCEPTION 'A 16-week regular season only supports a 4-team playoff because the NFL season ends at week 18';
    END IF;

    tiebreaker := COALESCE(p_standings_tiebreaker, 'record_then_points');
    IF tiebreaker NOT IN ('record_then_points', 'points_then_record') THEN
        RAISE EXCEPTION 'standings_tiebreaker must be record_then_points or points_then_record';
    END IF;

    IF mode = 'live' AND p_draft_at IS NULL THEN
        RAISE EXCEPTION 'Live drafts require a scheduled draft time';
    END IF;

    stored_at := CASE WHEN mode = 'offline' THEN NULL ELSE p_draft_at END;

    SELECT email INTO current_user_email
    FROM auth.users
    WHERE id = current_user_id;

    IF owner_team_name IS NULL THEN
        default_team_name := COALESCE(
            split_part(current_user_email, '@', 1) || '''s Team',
            'Team 1'
        );
    ELSE
        default_team_name := owner_team_name;
    END IF;

    INSERT INTO leagues (
        name, season, teams_started_per_week, created_by,
        draft_mode, draft_at, draft_pick_seconds, draft_format,
        playoff_teams, standings_tiebreaker, regular_season_weeks
    )
    VALUES (
        league_name, season, teams_started_per_week, current_user_id,
        mode, stored_at, pick_secs, fmt,
        playoff_n, tiebreaker, rs_weeks
    )
    RETURNING id INTO new_league_id;

    INSERT INTO league_members (league_id, user_id, role)
    VALUES (new_league_id, current_user_id, 'owner');

    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (new_league_id, default_team_name, current_user_id);

    INSERT INTO weeks (league_id, week_number)
    SELECT new_league_id, generate_series(1, 18);

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        new_league_id,
        current_user_id,
        'CREATE',
        'league',
        new_league_id,
        jsonb_build_object(
            'name', league_name,
            'season', season,
            'teams_started_per_week', teams_started_per_week,
            'owner_team_name', default_team_name,
            'draft_mode', mode,
            'draft_at', stored_at,
            'draft_pick_seconds', pick_secs,
            'draft_format', fmt,
            'playoff_teams', playoff_n,
            'standings_tiebreaker', tiebreaker,
            'regular_season_weeks', rs_weeks
        )
    );

    RETURN new_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_league TO authenticated;

COMMENT ON FUNCTION create_league IS
    'Create a league. Draft mode async|live|offline. Regular season 14|15|16 (default 14). Playoff field 4|5|6 (default 4); RS=16 requires 4.';

-- ============================================================
-- set_league_season_settings: + RS; append/trim matchups
-- ============================================================

DROP FUNCTION IF EXISTS set_league_season_settings(UUID, SMALLINT, TEXT);

CREATE OR REPLACE FUNCTION set_league_season_settings(
    p_league_id UUID,
    p_playoff_teams SMALLINT,
    p_standings_tiebreaker TEXT,
    p_regular_season_weeks SMALLINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    old_rs SMALLINT;
    new_rs SMALLINT;
    has_rs_rows BOOLEAN;
    w INTEGER;
    source_week INTEGER;
    do_flip BOOLEAN;
    src_ok BOOLEAN;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can update season settings';
    END IF;

    IF p_playoff_teams NOT IN (4, 5, 6) THEN
        RAISE EXCEPTION 'playoff_teams must be 4, 5, or 6';
    END IF;

    new_rs := p_regular_season_weeks;
    IF new_rs NOT IN (14, 15, 16) THEN
        RAISE EXCEPTION 'regular_season_weeks must be 14, 15, or 16';
    END IF;

    IF new_rs = 16 AND p_playoff_teams <> 4 THEN
        RAISE EXCEPTION 'A 16-week regular season only supports a 4-team playoff because the NFL season ends at week 18';
    END IF;

    IF p_standings_tiebreaker NOT IN ('record_then_points', 'points_then_record') THEN
        RAISE EXCEPTION 'standings_tiebreaker must be record_then_points or points_then_record';
    END IF;

    IF EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id AND is_playoff
    ) THEN
        RAISE EXCEPTION 'Season settings are locked once the bracket exists';
    END IF;

    SELECT regular_season_weeks INTO old_rs
    FROM leagues
    WHERE id = p_league_id;

    IF old_rs IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id
          AND COALESCE(is_playoff, FALSE) = FALSE
    ) INTO has_rs_rows;

    IF has_rs_rows AND new_rs > old_rs THEN
        FOR w IN (old_rs + 1)..new_rs LOOP
            IF EXISTS (
                SELECT 1 FROM league_matchups
                WHERE league_id = p_league_id
                  AND week = w
                  AND COALESCE(is_playoff, FALSE) = FALSE
            ) THEN
                CONTINUE;
            END IF;

            source_week := ((w - 1) % 7) + 1;
            do_flip := ((w - 1) / 7) % 2 = 1;

            SELECT
                (SELECT COUNT(*) FROM league_matchups
                 WHERE league_id = p_league_id AND week = source_week
                   AND COALESCE(is_playoff, FALSE) = FALSE) = 4
                AND (
                    SELECT COUNT(DISTINCT tid) FROM (
                        SELECT fantasy_team1_id AS tid FROM league_matchups
                        WHERE league_id = p_league_id AND week = source_week
                          AND COALESCE(is_playoff, FALSE) = FALSE
                        UNION ALL
                        SELECT fantasy_team2_id FROM league_matchups
                        WHERE league_id = p_league_id AND week = source_week
                          AND COALESCE(is_playoff, FALSE) = FALSE
                    ) sides
                ) = 8
            INTO src_ok;

            IF NOT COALESCE(src_ok, FALSE) THEN
                RAISE EXCEPTION
                    'Cannot extend the regular season: week % must have exactly 4 games and 8 distinct teams to derive week %',
                    source_week, w;
            END IF;

            IF do_flip THEN
                INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
                SELECT p_league_id, w, fantasy_team2_id, fantasy_team1_id, FALSE
                FROM league_matchups
                WHERE league_id = p_league_id
                  AND week = source_week
                  AND COALESCE(is_playoff, FALSE) = FALSE;
            ELSE
                INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
                SELECT p_league_id, w, fantasy_team1_id, fantasy_team2_id, FALSE
                FROM league_matchups
                WHERE league_id = p_league_id
                  AND week = source_week
                  AND COALESCE(is_playoff, FALSE) = FALSE;
            END IF;
        END LOOP;
    ELSIF has_rs_rows AND new_rs < old_rs THEN
        DELETE FROM league_matchups
        WHERE league_id = p_league_id
          AND COALESCE(is_playoff, FALSE) = FALSE
          AND week > new_rs;
    END IF;

    UPDATE leagues
    SET playoff_teams = p_playoff_teams,
        standings_tiebreaker = p_standings_tiebreaker,
        regular_season_weeks = new_rs
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'UPDATE',
        'season_settings',
        p_league_id,
        jsonb_build_object(
            'playoff_teams', p_playoff_teams,
            'standings_tiebreaker', p_standings_tiebreaker,
            'regular_season_weeks', new_rs,
            'previous_regular_season_weeks', old_rs
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_league_season_settings TO authenticated;

COMMENT ON FUNCTION set_league_season_settings IS
    'Owner updates playoff field, tiebreaker, and regular season length until a playoff row exists. Increasing RS appends cycle weeks; decreasing deletes trailing RS rows.';

-- ============================================================
-- Schedule generation: loop 1..regular_season_weeks
-- ============================================================

CREATE OR REPLACE FUNCTION _generate_league_schedule_impl(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_count INTEGER;
    team_ids UUID[];
    week_num INTEGER;
    round_idx INTEGER;
    flip BOOLEAN;
    k INTEGER;
    team1_id UUID;
    team2_id UUID;
    swap_id UUID;
    rs_weeks INTEGER;
BEGIN
    SELECT regular_season_weeks INTO rs_weeks
    FROM leagues
    WHERE id = p_league_id;

    IF rs_weeks IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    SELECT array_agg(id ORDER BY random()), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Schedule generation requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    IF EXISTS(
        SELECT 1 FROM weeks w
        WHERE w.league_id = p_league_id AND w.is_locked
    ) OR EXISTS(
        SELECT 1 FROM league_matchups lm
        WHERE lm.league_id = p_league_id AND lm.is_complete
    ) THEN
        RAISE EXCEPTION 'The season has started (locked weeks or recorded scores exist); the schedule can no longer be regenerated';
    END IF;

    DELETE FROM league_matchups WHERE league_id = p_league_id;

    FOR week_num IN 1..rs_weeks LOOP
        round_idx := (week_num - 1) % 7;
        flip := ((week_num - 1) / 7) % 2 = 1;

        FOR k IN 0..3 LOOP
            IF k = 0 THEN
                team1_id := team_ids[round_idx + 1];
                team2_id := team_ids[8];
            ELSE
                team1_id := team_ids[((round_idx + k) % 7) + 1];
                team2_id := team_ids[((round_idx - k + 7) % 7) + 1];
            END IF;

            IF flip THEN
                swap_id := team1_id;
                team1_id := team2_id;
                team2_id := swap_id;
            END IF;

            INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
            VALUES (p_league_id, week_num, team1_id, team2_id, FALSE);
        END LOOP;
    END LOOP;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        p_league_id,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', rs_weeks,
            'matchups_generated', rs_weeks * 4
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION _generate_league_schedule_impl(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    mode TEXT;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    SELECT draft_mode INTO mode FROM leagues WHERE id = p_league_id;
    IF mode = 'offline' THEN
        RAISE EXCEPTION 'Offline leagues use the manual 7-week schedule; randomize is not available';
    END IF;

    RETURN _generate_league_schedule_impl(p_league_id);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;

COMMENT ON FUNCTION generate_league_schedule IS
  'Generate a regular-season round-robin (weeks 1..regular_season_weeks) with randomized seating. Requires 8 teams and the owner. Pre-season only. Refuses offline leagues.';

-- ============================================================
-- set_league_schedule: expand through RS (15≡1, 16≡2)
-- ============================================================

CREATE OR REPLACE FUNCTION set_league_schedule(
    p_league_id UUID,
    p_matchups JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    team_count INTEGER;
    mode TEXT;
    rs_weeks INTEGER;
    expected_len INTEGER;
    max_week INTEGER;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can set the schedule';
    END IF;

    SELECT draft_mode, regular_season_weeks INTO mode, rs_weeks
    FROM leagues WHERE id = p_league_id;
    IF mode IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    SELECT COUNT(*) INTO team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Schedule requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    IF mode = 'offline' THEN
        expected_len := 28;
        max_week := 7;
    ELSE
        IF EXISTS(
            SELECT 1 FROM weeks w
            WHERE w.league_id = p_league_id AND w.is_locked
        ) OR EXISTS(
            SELECT 1 FROM league_matchups lm
            WHERE lm.league_id = p_league_id AND lm.is_complete
        ) THEN
            RAISE EXCEPTION 'The season has started (locked weeks or recorded scores exist); the schedule can no longer be regenerated';
        END IF;
        expected_len := rs_weeks * 4;
        max_week := rs_weeks;
    END IF;

    IF jsonb_typeof(p_matchups) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_matchups) IS DISTINCT FROM expected_len THEN
        IF mode = 'offline' THEN
            RAISE EXCEPTION 'Offline schedule must contain exactly 28 matchups (7 weeks x 4)';
        ELSE
            RAISE EXCEPTION 'Schedule must contain exactly % matchups (% weeks x 4)', expected_len, rs_weeks;
        END IF;
    END IF;

    DROP TABLE IF EXISTS _sched;
    CREATE TEMP TABLE _sched (
        week INTEGER,
        team1 UUID,
        team2 UUID
    ) ON COMMIT DROP;

    INSERT INTO _sched (week, team1, team2)
    SELECT
        (elem->>'week')::INTEGER,
        (elem->>'fantasy_team1_id')::UUID,
        (elem->>'fantasy_team2_id')::UUID
    FROM jsonb_array_elements(p_matchups) elem;

    IF EXISTS (SELECT 1 FROM _sched WHERE team1 = team2 OR team1 IS NULL OR team2 IS NULL OR week IS NULL) THEN
        RAISE EXCEPTION 'Each matchup needs two different teams and a week';
    END IF;

    IF EXISTS (
        SELECT 1 FROM _sched s
        WHERE NOT EXISTS (
            SELECT 1 FROM fantasy_teams ft
            WHERE ft.league_id = p_league_id AND ft.id = s.team1
        ) OR NOT EXISTS (
            SELECT 1 FROM fantasy_teams ft
            WHERE ft.league_id = p_league_id AND ft.id = s.team2
        )
    ) THEN
        RAISE EXCEPTION 'Every team in the schedule must belong to this league';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM generate_series(1, max_week) AS w(week)
        LEFT JOIN (
            SELECT week, COUNT(*) AS games
            FROM _sched
            GROUP BY week
        ) g ON g.week = w.week
        WHERE COALESCE(g.games, 0) <> 4
    ) OR EXISTS (
        SELECT 1 FROM _sched WHERE week < 1 OR week > max_week
    ) OR EXISTS (
        SELECT week
        FROM (
            SELECT week, team1 AS team_id FROM _sched
            UNION ALL
            SELECT week, team2 FROM _sched
        ) sides
        GROUP BY week
        HAVING COUNT(DISTINCT team_id) <> 8
    ) THEN
        IF mode = 'offline' THEN
            RAISE EXCEPTION 'Each week 1–7 needs exactly 4 games and 8 distinct teams';
        ELSE
            RAISE EXCEPTION 'Each week 1–% needs exactly 4 games and 8 distinct teams', rs_weeks;
        END IF;
    END IF;

    IF mode = 'offline' THEN
        -- Weeks 8–14: flipped copies of 1–7
        INSERT INTO _sched (week, team1, team2)
        SELECT week + 7, team2, team1
        FROM _sched
        WHERE week BETWEEN 1 AND 7;

        -- Week 15 ≡ week 1 (no flip); week 16 ≡ week 2 (no flip)
        IF rs_weeks >= 15 THEN
            INSERT INTO _sched (week, team1, team2)
            SELECT 15, team1, team2
            FROM _sched
            WHERE week = 1;
        END IF;
        IF rs_weeks >= 16 THEN
            INSERT INTO _sched (week, team1, team2)
            SELECT 16, team1, team2
            FROM _sched
            WHERE week = 2;
        END IF;

        DELETE FROM league_matchups
        WHERE league_id = p_league_id
          AND COALESCE(is_playoff, FALSE) = FALSE
          AND week BETWEEN 1 AND rs_weeks;

        INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
        SELECT p_league_id, week, team1, team2, FALSE
        FROM _sched
        WHERE week BETWEEN 1 AND rs_weeks;

        INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
        VALUES (
            p_league_id,
            current_user_id,
            'SET',
            'schedule',
            p_league_id,
            jsonb_build_object(
                'source', 'offline_manual',
                'template_weeks', 7,
                'regular_season_weeks', rs_weeks,
                'matchups_written', rs_weeks * 4
            )
        );
    ELSE
        DELETE FROM league_matchups WHERE league_id = p_league_id;

        INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
        SELECT p_league_id, week, team1, team2, FALSE
        FROM _sched;

        INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
        VALUES (
            p_league_id,
            current_user_id,
            'SET',
            'schedule',
            p_league_id,
            jsonb_build_object(
                'weeks_generated', rs_weeks,
                'matchups_generated', rs_weeks * 4,
                'source', 'manual'
            )
        );
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_league_schedule(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION set_league_schedule IS
  'Owner sets the regular-season schedule. Offline: 28 games (weeks 1–7); server expands through regular_season_weeks (8–14 flipped; 15≡1; 16≡2); mid-season rewrite allowed; playoff rows left alone. Async/live: RS*4 games, pre-season only.';

-- ============================================================
-- Playoffs: RS-relative status + messages
-- ============================================================

CREATE OR REPLACE FUNCTION _advance_playoffs(p_league_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    n INTEGER;
    rs_weeks INTEGER;
    final_week INTEGER;
    seed_ids UUID[];
    alive INTEGER[];
    wk INTEGER;
    latest INTEGER;
    has_playoff BOOLEAN;
    rs_complete BOOLEAN;
    m RECORD;
    seed1 INTEGER;
    seed2 INTEGER;
    loser INTEGER;
    bye_count INTEGER;
    rest INTEGER[];
    rest_len INTEGER;
    i INTEGER;
    next_week INTEGER;
BEGIN
    SELECT playoff_teams, regular_season_weeks
    INTO n, rs_weeks
    FROM leagues
    WHERE id = p_league_id;

    IF n IS NULL THEN
        RETURN 'noop';
    END IF;

    IF EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id
          AND week > rs_weeks
          AND NOT is_playoff
    ) THEN
        RETURN 'blocked_legacy';
    END IF;

    final_week := CASE WHEN n = 4 THEN rs_weeks + 2 ELSE rs_weeks + 3 END;

    SELECT EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id AND is_playoff
    ) INTO has_playoff;

    SELECT COUNT(*) = 4
       AND COUNT(*) FILTER (
            WHERE is_complete AND team1_score IS NOT NULL AND team2_score IS NOT NULL
       ) = 4
    INTO rs_complete
    FROM league_matchups
    WHERE league_id = p_league_id
      AND week = rs_weeks
      AND NOT is_playoff;

    IF NOT has_playoff AND NOT COALESCE(rs_complete, FALSE) THEN
        RETURN 'regular_season_incomplete';
    END IF;

    SELECT COALESCE(array_agg(ranked.fantasy_team_id ORDER BY ranked.rank), '{}')
    INTO seed_ids
    FROM (
        SELECT fantasy_team_id, rank
        FROM v_league_standings
        WHERE league_id = p_league_id
        ORDER BY rank
        LIMIT n
    ) ranked;

    IF COALESCE(array_length(seed_ids, 1), 0) < n THEN
        RETURN 'regular_season_incomplete';
    END IF;

    alive := ARRAY(SELECT generate_series(1, n));

    FOR wk IN
        SELECT DISTINCT lm.week
        FROM league_matchups lm
        WHERE lm.league_id = p_league_id AND lm.is_playoff
        ORDER BY lm.week
    LOOP
        IF EXISTS (
            SELECT 1 FROM league_matchups
            WHERE league_id = p_league_id
              AND week = wk
              AND is_playoff
              AND (NOT is_complete OR team1_score IS NULL OR team2_score IS NULL)
        ) THEN
            EXIT;
        END IF;

        FOR m IN
            SELECT fantasy_team1_id, fantasy_team2_id, team1_score, team2_score
            FROM league_matchups
            WHERE league_id = p_league_id AND week = wk AND is_playoff
        LOOP
            seed1 := array_position(seed_ids, m.fantasy_team1_id);
            seed2 := array_position(seed_ids, m.fantasy_team2_id);
            IF m.team1_score > m.team2_score OR (m.team1_score = m.team2_score AND seed1 < seed2) THEN
                loser := seed2;
            ELSE
                loser := seed1;
            END IF;
            alive := ARRAY(
                SELECT x FROM unnest(alive) AS x WHERE x <> loser ORDER BY x
            );
        END LOOP;
    END LOOP;

    IF NOT has_playoff THEN
        next_week := rs_weeks + 1;
        bye_count := CASE n WHEN 6 THEN 2 WHEN 5 THEN 1 ELSE 0 END;
    ELSE
        SELECT MAX(week) INTO latest
        FROM league_matchups
        WHERE league_id = p_league_id AND is_playoff;

        IF EXISTS (
            SELECT 1 FROM league_matchups
            WHERE league_id = p_league_id
              AND week = latest
              AND is_playoff
              AND (NOT is_complete OR team1_score IS NULL OR team2_score IS NULL)
        ) THEN
            RETURN 'noop';
        END IF;

        IF COALESCE(array_length(alive, 1), 0) <= 1 THEN
            RETURN 'championship_done';
        END IF;

        next_week := latest + 1;
        IF next_week > final_week THEN
            RETURN 'championship_done';
        END IF;

        bye_count := CASE WHEN COALESCE(array_length(alive, 1), 0) % 2 = 1 THEN 1 ELSE 0 END;
    END IF;

    IF EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id AND week = next_week
    ) THEN
        RETURN 'noop';
    END IF;

    rest := alive[(bye_count + 1) : array_length(alive, 1)];
    rest_len := COALESCE(array_length(rest, 1), 0);
    IF rest_len < 2 THEN
        RETURN 'championship_done';
    END IF;

    i := 1;
    WHILE i <= rest_len / 2 LOOP
        INSERT INTO league_matchups (
            league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff
        )
        VALUES (
            p_league_id,
            next_week,
            seed_ids[rest[i]],
            seed_ids[rest[rest_len - i + 1]],
            TRUE
        );
        i := i + 1;
    END LOOP;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'playoffs',
        p_league_id,
        jsonb_build_object('week', next_week, 'playoff_teams', n)
    );

    RETURN 'advanced';
END;
$$;

REVOKE ALL ON FUNCTION _advance_playoffs(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION generate_playoffs(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    status TEXT;
    rs_weeks INTEGER;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate playoffs';
    END IF;

    SELECT regular_season_weeks INTO rs_weeks
    FROM leagues WHERE id = p_league_id;

    status := _advance_playoffs(p_league_id);

    IF status = 'blocked_legacy' THEN
        RAISE EXCEPTION
            'This league already has regular-season games after week %; playoffs were not generated',
            rs_weeks;
    END IF;

    IF status = 'regular_season_incomplete' THEN
        RAISE EXCEPTION
            'Playoffs start after week % is complete and every game has a score',
            rs_weeks;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_playoffs(UUID) TO authenticated;

COMMENT ON FUNCTION generate_playoffs IS
    'Owner: seed or advance one playoff round once the previous week has scores. First playoff week is regular_season_weeks + 1. Idempotent.';

-- ============================================================
-- finalize_week_scores: advance whenever week >= that league's RS
-- ============================================================

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
    lid UUID;
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

    FOR lid IN
        SELECT DISTINCT lm.league_id
        FROM league_matchups lm
        JOIN leagues l ON l.id = lm.league_id AND l.season = p_season
        WHERE lm.week = p_week
          AND p_week >= l.regular_season_weeks
    LOOP
        PERFORM _advance_playoffs(lid);
    END LOOP;

    RETURN finalized;
END;
$$;

COMMENT ON FUNCTION finalize_week_scores IS
    'Persist matchup scores for a locked week; platform-admin only. When the week is at or past that league''s regular_season_weeks, advances its playoff bracket.';
