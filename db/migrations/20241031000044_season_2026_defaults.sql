-- Season 2026 defaults: table + RPC p_season / season param defaults

ALTER TABLE leagues ALTER COLUMN season SET DEFAULT 2026;

CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2026,
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

CREATE OR REPLACE FUNCTION finalize_week_scores(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2026
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

CREATE OR REPLACE FUNCTION platform_finalize_week(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2026
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    lid UUID;
    auto_filled_total INTEGER := 0;
    leagues_ok INTEGER := 0;
    leagues_skipped INTEGER := 0;
    matchups_finalized INTEGER := 0;
    league_errors JSONB := '[]'::JSONB;
    err_text TEXT;
    filled INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT auth.is_platform_admin() THEN
        RAISE EXCEPTION 'Platform admin required';
    END IF;

    FOR lid IN
        SELECT DISTINCT lm.league_id
        FROM league_matchups lm
        JOIN leagues l ON l.id = lm.league_id AND l.season = p_season
        WHERE lm.week = p_week
        ORDER BY 1
    LOOP
        BEGIN
            filled := _finalize_league_week_lineups(lid, p_week, auth.uid());
            auto_filled_total := auto_filled_total + COALESCE(filled, 0);
            leagues_ok := leagues_ok + 1;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS err_text = MESSAGE_TEXT;
            leagues_skipped := leagues_skipped + 1;
            league_errors := league_errors || jsonb_build_array(
                jsonb_build_object('league_id', lid, 'error', err_text)
            );
        END;
    END LOOP;

    -- Persist scores for locked weeks (same gate as before; we just locked them)
    matchups_finalized := finalize_week_scores(p_week, p_season);

    RETURN jsonb_build_object(
        'week', p_week,
        'season', p_season,
        'leagues_processed', leagues_ok,
        'leagues_failed', leagues_skipped,
        'auto_filled', auto_filled_total,
        'matchups_finalized', matchups_finalized,
        'league_errors', league_errors
    );
END;
$$;

GRANT EXECUTE ON FUNCTION platform_finalize_week TO authenticated;

COMMENT ON FUNCTION platform_finalize_week IS
    'Platform admin: for every league in the season with matchups that week, auto-fill/lock lineups and lock the week, then persist matchup scores. Idempotent. Per-league lineup failures are collected; scoring still runs for leagues that locked.';

CREATE OR REPLACE FUNCTION enqueue_lineup_reminders(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2026
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    queued INTEGER := 0;
    r RECORD;
    prefs JSONB;
BEGIN
    FOR r IN
        SELECT DISTINCT ft.manager_user_id AS user_id, l.id AS league_id, l.name AS league_name
        FROM fantasy_teams ft
        JOIN leagues l ON l.id = ft.league_id AND l.season = p_season
        JOIN weeks w ON w.league_id = l.id AND w.week_number = p_week AND NOT w.is_locked
        WHERE ft.manager_user_id IS NOT NULL
          AND l.draft_status = 'complete'
          AND NOT EXISTS (
              SELECT 1 FROM fantasy_lineups fl
              WHERE fl.fantasy_team_id = ft.id AND fl.week = p_week
          )
    LOOP
        SELECT up.email_preferences INTO prefs
        FROM user_profiles up
        WHERE up.user_id = r.user_id;

        IF prefs IS NOT NULL AND COALESCE((prefs->>'matchup_reminders')::boolean, true) = false THEN
            CONTINUE;
        END IF;

        PERFORM enqueue_email(
            r.user_id,
            'lineup_reminder',
            jsonb_build_object(
                'league_id', r.league_id,
                'league_name', r.league_name,
                'week', p_week
            )
        );
        queued := queued + 1;
    END LOOP;

    RETURN queued;
END;
$$;

-- Callable only by the server (admin connection); not granted to authenticated
REVOKE EXECUTE ON FUNCTION enqueue_lineup_reminders FROM PUBLIC, anon, authenticated;
