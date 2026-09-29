-- Platform-admin week close: lock lineups across all leagues for a week, then
-- persist matchup scores. CSV import calls platform_finalize_week so one upload
-- closes scoring site-wide (no per-league commissioner Finalize required first).
-- Commissioners may still finalize_week_lineups earlier to reveal opponents.

-- ============================================================
-- Internal: auto-fill + lock lineups + lock week (no auth check)
-- ============================================================
CREATE OR REPLACE FUNCTION _finalize_league_week_lineups(
    p_league_id UUID,
    p_week INTEGER,
    p_actor UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    actor UUID := COALESCE(p_actor, auth.uid());
    teams_started INTEGER;
    team RECORD;
    auto_teams UUID[];
    auto_filled INTEGER := 0;
    week_seeded BOOLEAN;
BEGIN
    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = p_league_id;

    IF teams_started IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM matchups m
        WHERE m.week = p_week AND m.game_time IS NOT NULL
    ) INTO week_seeded;

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
              AND (
                  NOT week_seeded
                  OR EXISTS (
                      SELECT 1
                      FROM teams t
                      JOIN matchups m
                        ON (m.team1_id = t.id OR m.team2_id = t.id)
                       AND m.week = p_week
                      WHERE t.uuid_id = ftr.nfl_team_id
                  )
              )
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
            actor,
            'AUTO_FILL',
            'fantasy_lineup',
            team.id,
            jsonb_build_object('week', p_week, 'active_nfl_teams', auto_teams, 'source', 'platform_finalize')
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
        actor,
        'FINALIZE',
        'week',
        NULL,
        jsonb_build_object('week', p_week, 'auto_filled', auto_filled, 'source', 'platform_finalize')
    );

    RETURN auto_filled;
END;
$$;

REVOKE EXECUTE ON FUNCTION _finalize_league_week_lineups FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION _finalize_league_week_lineups FROM anon;
REVOKE EXECUTE ON FUNCTION _finalize_league_week_lineups FROM authenticated;

COMMENT ON FUNCTION _finalize_league_week_lineups IS
    'Internal: auto-fill incomplete lineups, lock lineups + week for one league. No auth — callers must authorize.';

-- ============================================================
-- Commissioner path: owner check, then internal helper
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_week_lineups(
    p_league_id UUID,
    p_week INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = current_user_id
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can finalize a week';
    END IF;

    RETURN _finalize_league_week_lineups(p_league_id, p_week, current_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION finalize_week_lineups TO authenticated;

COMMENT ON FUNCTION finalize_week_lineups IS
    'Commissioner: auto-fill and lock lineups for teams that have a matchup this week (skip NFL bye teams when kickoffs are seeded), then lock the week. Fantasy byes are skipped.';

-- ============================================================
-- Platform-admin: lock all season leagues for the week, then scores
-- ============================================================
CREATE OR REPLACE FUNCTION platform_finalize_week(
    p_week INTEGER,
    p_season INTEGER DEFAULT 2025
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
