-- 14-week regular season and a reseeded playoff bracket.
-- playoff_teams: 4 | 5 | 6 | 8. Settings stay editable until a playoff row exists.
-- Standings and seeds count weeks 1–14 only. A tied playoff game goes to the better seed.

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS playoff_teams SMALLINT NOT NULL DEFAULT 4,
    ADD COLUMN IF NOT EXISTS standings_tiebreaker TEXT NOT NULL DEFAULT 'record_then_points',
    ADD COLUMN IF NOT EXISTS regular_season_weeks SMALLINT NOT NULL DEFAULT 14;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_playoff_teams_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_playoff_teams_check
    CHECK (playoff_teams IN (4, 5, 6, 8));

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_standings_tiebreaker_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_standings_tiebreaker_check
    CHECK (standings_tiebreaker IN ('record_then_points', 'points_then_record'));

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_regular_season_weeks_check;
ALTER TABLE leagues ADD CONSTRAINT leagues_regular_season_weeks_check
    CHECK (regular_season_weeks = 14);

ALTER TABLE league_matchups
    ADD COLUMN IF NOT EXISTS is_playoff BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN leagues.playoff_teams IS 'Playoff field: 4, 5, 6, or 8. Locked once a playoff matchup exists.';
COMMENT ON COLUMN leagues.standings_tiebreaker IS 'record_then_points or points_then_record. Locked once a playoff matchup exists.';
COMMENT ON COLUMN leagues.regular_season_weeks IS 'Always 14. Playoff weeks start at 15.';
COMMENT ON COLUMN league_matchups.is_playoff IS 'True for bracket games. Byes and non-qualifiers have no row.';

-- ============================================================
-- Standings: regular season only, league tiebreaker
-- ============================================================

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
    JOIN leagues lg ON lg.id = lm.league_id
    WHERE lm.is_complete
      AND lm.week <= lg.regular_season_weeks
      AND NOT lm.is_playoff
      AND lm.team1_score IS NOT NULL
      AND lm.team2_score IS NOT NULL
    UNION ALL
    SELECT
        lm.league_id,
        lm.fantasy_team2_id,
        lm.team2_score,
        lm.team1_score
    FROM league_matchups lm
    JOIN leagues lg ON lg.id = lm.league_id
    WHERE lm.is_complete
      AND lm.week <= lg.regular_season_weeks
      AND NOT lm.is_playoff
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
            CASE WHEN l.standings_tiebreaker = 'points_then_record' THEN tr.points_for ELSE tr.wins END DESC,
            CASE WHEN l.standings_tiebreaker = 'points_then_record' THEN tr.wins ELSE tr.points_for END DESC,
            COALESCE(array_position(l.draft_order, tr.fantasy_team_id), 2147483647),
            tr.team_name
    ) AS rank,
    tr.logo_url
FROM team_records tr
LEFT JOIN leagues l ON l.id = tr.league_id;

COMMENT ON VIEW v_league_standings IS
  'Regular-season W-L-T (weeks 1–14). Rank uses standings_tiebreaker, then draft order, then name.';

-- ============================================================
-- League list / details include season settings
-- ============================================================

CREATE OR REPLACE VIEW v_user_leagues AS
SELECT
    l.id,
    l.name,
    l.season,
    l.teams_started_per_week,
    l.draft_at,
    l.created_at,
    lm.role as user_role,
    (SELECT COUNT(*) FROM league_members lm2 WHERE lm2.league_id = l.id) as member_count,
    (SELECT COUNT(*) FROM fantasy_teams ft WHERE ft.league_id = l.id) as fantasy_teams_count,
    (SELECT lm_owner.user_id FROM league_members lm_owner WHERE lm_owner.league_id = l.id AND lm_owner.role = 'owner' LIMIT 1) as owner_user_id,
    l.draft_status,
    (
        l.draft_status = 'in_progress'
        AND l.draft_mode IS DISTINCT FROM 'offline'
        AND COALESCE(l.draft_paused, FALSE) = FALSE
        AND EXISTS (
            SELECT 1
            FROM draft_picks dp
            JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
            WHERE dp.league_id = l.id
              AND dp.pick_number = l.draft_current_pick
              AND ft.manager_user_id = auth.uid()
        )
    ) as my_pick,
    l.draft_mode,
    l.draft_pick_seconds,
    l.draft_paused,
    l.draft_format,
    l.playoff_teams,
    l.standings_tiebreaker,
    l.regular_season_weeks
FROM leagues l
JOIN league_members lm ON l.id = lm.league_id
WHERE lm.user_id = auth.uid();

DROP FUNCTION IF EXISTS get_user_leagues();

CREATE OR REPLACE FUNCTION get_user_leagues()
RETURNS TABLE (
    id UUID,
    name TEXT,
    season INTEGER,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    user_role TEXT,
    member_count BIGINT,
    fantasy_teams_count BIGINT,
    owner_user_id UUID,
    draft_status TEXT,
    my_pick BOOLEAN,
    draft_mode TEXT,
    draft_pick_seconds INTEGER,
    draft_paused BOOLEAN,
    draft_format TEXT,
    playoff_teams SMALLINT,
    standings_tiebreaker TEXT,
    regular_season_weeks SMALLINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    RETURN QUERY
    SELECT * FROM v_user_leagues
    ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_leagues TO authenticated;

DROP FUNCTION IF EXISTS get_league_details(UUID);

CREATE OR REPLACE FUNCTION get_league_details(league_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    season INTEGER,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    user_role TEXT,
    member_count BIGINT,
    fantasy_teams_count BIGINT,
    owner_user_id UUID,
    draft_status TEXT,
    my_pick BOOLEAN,
    draft_mode TEXT,
    draft_pick_seconds INTEGER,
    draft_paused BOOLEAN,
    draft_format TEXT,
    playoff_teams SMALLINT,
    standings_tiebreaker TEXT,
    regular_season_weeks SMALLINT
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

    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_league_details.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT * FROM v_user_leagues
    WHERE v_user_leagues.id = get_league_details.league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_details TO authenticated;

-- ============================================================
-- create_league: optional playoff size and tiebreaker
-- ============================================================

DROP FUNCTION IF EXISTS create_league(TEXT, INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT);

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
    p_standings_tiebreaker TEXT DEFAULT 'record_then_points'
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
    IF playoff_n NOT IN (4, 5, 6, 8) THEN
        RAISE EXCEPTION 'playoff_teams must be 4, 5, 6, or 8';
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
        playoff_n, tiebreaker, 14
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
            'standings_tiebreaker', tiebreaker
        )
    );

    RETURN new_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_league TO authenticated;

COMMENT ON FUNCTION create_league IS
    'Create a league. Draft mode async|live|offline. Playoff field defaults to 4; tiebreaker defaults to record then points.';

-- ============================================================
-- Season settings (until the first playoff row)
-- ============================================================

CREATE OR REPLACE FUNCTION set_league_season_settings(
    p_league_id UUID,
    p_playoff_teams SMALLINT,
    p_standings_tiebreaker TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
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

    IF p_playoff_teams NOT IN (4, 5, 6, 8) THEN
        RAISE EXCEPTION 'playoff_teams must be 4, 5, 6, or 8';
    END IF;

    IF p_standings_tiebreaker NOT IN ('record_then_points', 'points_then_record') THEN
        RAISE EXCEPTION 'standings_tiebreaker must be record_then_points or points_then_record';
    END IF;

    IF EXISTS (
        SELECT 1 FROM league_matchups
        WHERE league_id = p_league_id AND is_playoff
    ) THEN
        RAISE EXCEPTION 'Playoff size and tiebreaker are locked once the bracket exists';
    END IF;

    UPDATE leagues
    SET playoff_teams = p_playoff_teams,
        standings_tiebreaker = p_standings_tiebreaker
    WHERE id = p_league_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'UPDATE',
        'season_settings',
        p_league_id,
        jsonb_build_object(
            'playoff_teams', p_playoff_teams,
            'standings_tiebreaker', p_standings_tiebreaker
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_league_season_settings TO authenticated;

-- ============================================================
-- Regular-season schedule: weeks 1–14 only
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
BEGIN
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

    FOR week_num IN 1..14 LOOP
        round_idx := (week_num - 1) % 7;
        flip := week_num BETWEEN 8 AND 14;

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
            'weeks_generated', 14,
            'matchups_generated', 56
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION _generate_league_schedule_impl(UUID) FROM PUBLIC;

COMMENT ON FUNCTION generate_league_schedule IS
  'Generate a 14-week round-robin with randomized seating. Requires 8 teams and the owner. Pre-season only. Draft start calls this when no matchups exist.';

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

    SELECT COUNT(*) INTO team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Schedule requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
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

    IF jsonb_typeof(p_matchups) IS DISTINCT FROM 'array' OR jsonb_array_length(p_matchups) IS DISTINCT FROM 56 THEN
        RAISE EXCEPTION 'Schedule must contain exactly 56 matchups (14 weeks x 4)';
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
        FROM generate_series(1, 14) AS w(week)
        LEFT JOIN (
            SELECT week, COUNT(*) AS games
            FROM _sched
            GROUP BY week
        ) g ON g.week = w.week
        WHERE COALESCE(g.games, 0) <> 4
    ) OR EXISTS (
        SELECT 1 FROM _sched WHERE week < 1 OR week > 14
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
        RAISE EXCEPTION 'Each week 1–14 needs exactly 4 games and 8 distinct teams';
    END IF;

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
        jsonb_build_object('weeks_generated', 14, 'matchups_generated', 56, 'source', 'manual')
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_league_schedule(UUID, JSONB) TO authenticated;

-- ============================================================
-- Playoff bracket
-- Returns: advanced | noop | blocked_legacy | week14_incomplete | championship_done
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
    week14_ok BOOLEAN;
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
    INTO week14_ok
    FROM league_matchups
    WHERE league_id = p_league_id
      AND week = rs_weeks
      AND NOT is_playoff;

    IF NOT has_playoff AND NOT COALESCE(week14_ok, FALSE) THEN
        RETURN 'week14_incomplete';
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
        RETURN 'week14_incomplete';
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

    status := _advance_playoffs(p_league_id);

    IF status = 'blocked_legacy' THEN
        RAISE EXCEPTION 'This league already has regular-season games after week 14; playoffs were not generated';
    END IF;

    IF status = 'week14_incomplete' THEN
        RAISE EXCEPTION 'Playoffs start after week 14 is complete and every game has a score';
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_playoffs(UUID) TO authenticated;

COMMENT ON FUNCTION generate_playoffs IS
    'Owner: seed or advance one playoff round once the previous week has scores. Idempotent.';

-- ============================================================
-- Scores: platform admin writes them, then the bracket advances
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

    IF p_week >= 14 THEN
        FOR lid IN
            SELECT DISTINCT lm.league_id
            FROM league_matchups lm
            JOIN leagues l ON l.id = lm.league_id AND l.season = p_season
            WHERE lm.week = p_week
        LOOP
            PERFORM _advance_playoffs(lid);
        END LOOP;
    END IF;

    RETURN finalized;
END;
$$;

COMMENT ON FUNCTION finalize_week_scores IS
    'Persist matchup scores for a locked week; platform-admin only. From week 14 on, advances that league''s playoff bracket.';

-- ============================================================
-- Lineup finalize: only teams that have a game this week
-- ============================================================

CREATE OR REPLACE FUNCTION finalize_week_lineups(
    p_league_id UUID,
    p_week INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    teams_started INTEGER;
    team RECORD;
    auto_teams UUID[];
    auto_filled INTEGER := 0;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = current_user_id
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can finalize a week';
    END IF;

    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = p_league_id;

    IF teams_started IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    FOR team IN
        SELECT ft.id
        FROM fantasy_teams ft
        JOIN league_matchups lm
            ON lm.league_id = p_league_id
           AND lm.week = p_week
           AND (lm.fantasy_team1_id = ft.id OR lm.fantasy_team2_id = ft.id)
        LEFT JOIN fantasy_lineups fl
            ON fl.fantasy_team_id = ft.id AND fl.week = p_week
        WHERE ft.league_id = p_league_id
          AND COALESCE(array_length(fl.active_nfl_teams, 1), 0) != teams_started
    LOOP
        SELECT ARRAY(
            SELECT ftr.nfl_team_id
            FROM fantasy_team_rosters ftr
            WHERE ftr.fantasy_team_id = team.id
            ORDER BY ftr.draft_pick_number NULLS LAST, ftr.created_at, ftr.nfl_team_id
            LIMIT teams_started
        ) INTO auto_teams;

        IF COALESCE(array_length(auto_teams, 1), 0) < teams_started THEN
            RAISE EXCEPTION 'Cannot auto-fill lineup for fantasy team %: roster has fewer than % NFL teams', team.id, teams_started;
        END IF;

        INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
        VALUES (team.id, p_week, auto_teams, TRUE)
        ON CONFLICT (fantasy_team_id, week)
        DO UPDATE SET
            active_nfl_teams = EXCLUDED.active_nfl_teams,
            is_locked = TRUE,
            updated_at = NOW();

        auto_filled := auto_filled + 1;

        INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
        VALUES (
            p_league_id,
            current_user_id,
            'AUTO_FILL',
            'fantasy_lineup',
            team.id,
            jsonb_build_object('week', p_week, 'active_nfl_teams', auto_teams)
        );
    END LOOP;

    UPDATE fantasy_lineups
    SET is_locked = TRUE
    WHERE week = p_week
      AND fantasy_team_id IN (
          SELECT fantasy_team1_id FROM league_matchups
          WHERE league_id = p_league_id AND week = p_week
          UNION
          SELECT fantasy_team2_id FROM league_matchups
          WHERE league_id = p_league_id AND week = p_week
      );

    INSERT INTO weeks (league_id, week_number, is_locked)
    VALUES (p_league_id, p_week, TRUE)
    ON CONFLICT (league_id, week_number)
    DO UPDATE SET is_locked = TRUE;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'FINALIZE',
        'week',
        NULL,
        jsonb_build_object('week', p_week, 'auto_filled', auto_filled)
    );

    RETURN auto_filled;
END;
$$;

COMMENT ON FUNCTION finalize_week_lineups IS
    'Commissioner: auto-fill and lock lineups for teams that have a matchup this week, then lock the week. Byes are skipped.';

-- ============================================================
-- Schedule read includes the playoff flag
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
    is_complete BOOLEAN,
    is_playoff BOOLEAN
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
        lm.is_complete,
        lm.is_playoff
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

COMMENT ON FUNCTION get_league_schedule IS
    'Schedule for a league, optional week filter, with scores and is_playoff';
