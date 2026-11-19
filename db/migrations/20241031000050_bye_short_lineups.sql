-- Bye-week short / empty lineups:
-- When a seeded NFL week leaves fewer non-bye roster teams than
-- teams_started_per_week, managers may save exactly that many starters
-- (3 byes → start 1; 4 byes → empty []). Owners keep full-count override.
-- Finalize auto-fill no longer raises when byes cause a shortfall.

-- ---------------------------------------------------------------------------
-- set_fantasy_lineup: required = LEAST(teams_started, eligible) for managers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_fantasy_lineup(
    p_fantasy_team_id UUID,
    p_week INTEGER,
    p_active_nfl_teams UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    team_league_id UUID;
    is_authorized BOOLEAN;
    week_locked BOOLEAN;
    teams_started INTEGER;
    current_user_role TEXT;
    current_user_id UUID;
    prev_teams UUID[];
    week_seeded BOOLEAN;
    kicked UUID;
    eligible INTEGER;
    required INTEGER;
    submitted INTEGER;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT
        ft.league_id,
        (ft.manager_user_id = current_user_id OR lm.role = 'owner'),
        lm.role
    INTO team_league_id, is_authorized, current_user_role
    FROM fantasy_teams ft
    LEFT JOIN league_members lm ON ft.league_id = lm.league_id AND lm.user_id = current_user_id
    WHERE ft.id = p_fantasy_team_id;

    IF team_league_id IS NULL THEN
        RAISE EXCEPTION 'Fantasy team not found';
    END IF;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to set lineup for this fantasy team';
    END IF;

    SELECT COALESCE(w.is_locked, FALSE) INTO week_locked
    FROM weeks w
    WHERE w.league_id = team_league_id AND w.week_number = p_week;

    IF week_locked AND current_user_role != 'owner' THEN
        RAISE EXCEPTION 'Cannot modify lineup: Week % is locked', p_week;
    END IF;

    SELECT COALESCE(fl.active_nfl_teams, ARRAY[]::UUID[])
    INTO prev_teams
    FROM fantasy_lineups fl
    WHERE fl.fantasy_team_id = p_fantasy_team_id AND fl.week = p_week;

    IF NOT FOUND THEN
        prev_teams := ARRAY[]::UUID[];
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM matchups m
        WHERE m.week = p_week AND m.game_time IS NOT NULL
    ) INTO week_seeded;

    -- Per-team kickoff freeze + bye lock (owners override).
    IF current_user_role != 'owner' THEN
        -- Newly started after kickoff
        FOR kicked IN
            SELECT lt.nfl_id
            FROM unnest(COALESCE(p_active_nfl_teams, ARRAY[]::UUID[])) AS lt(nfl_id)
            WHERE NOT (lt.nfl_id = ANY (prev_teams))
              AND EXISTS (
                  SELECT 1
                  FROM teams t
                  JOIN matchups m
                    ON (m.team1_id = t.id OR m.team2_id = t.id)
                   AND m.week = p_week
                   AND m.game_time IS NOT NULL
                   AND m.game_time <= NOW()
                  WHERE t.uuid_id = lt.nfl_id
              )
        LOOP
            RAISE EXCEPTION 'Cannot start a team whose game has already kicked off';
        END LOOP;

        -- Newly benched after kickoff
        FOR kicked IN
            SELECT lt.nfl_id
            FROM unnest(prev_teams) AS lt(nfl_id)
            WHERE NOT (lt.nfl_id = ANY (COALESCE(p_active_nfl_teams, ARRAY[]::UUID[])))
              AND EXISTS (
                  SELECT 1
                  FROM teams t
                  JOIN matchups m
                    ON (m.team1_id = t.id OR m.team2_id = t.id)
                   AND m.week = p_week
                   AND m.game_time IS NOT NULL
                   AND m.game_time <= NOW()
                  WHERE t.uuid_id = lt.nfl_id
              )
        LOOP
            RAISE EXCEPTION 'Cannot bench a team whose game has already kicked off';
        END LOOP;

        -- Bye: only after week is seeded; team has no matchups row that week
        IF week_seeded THEN
            IF EXISTS (
                SELECT 1
                FROM unnest(COALESCE(p_active_nfl_teams, ARRAY[]::UUID[])) AS lt(nfl_id)
                JOIN teams t ON t.uuid_id = lt.nfl_id AND t.is_nfl
                WHERE NOT EXISTS (
                    SELECT 1 FROM matchups m
                    WHERE m.week = p_week
                      AND (m.team1_id = t.id OR m.team2_id = t.id)
                )
            ) THEN
                RAISE EXCEPTION 'Cannot start a team on bye';
            END IF;
        END IF;
    END IF;

    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = team_league_id;

    submitted := COALESCE(array_length(p_active_nfl_teams, 1), 0);

    IF current_user_role = 'owner' THEN
        required := teams_started;
        IF submitted != required THEN
            RAISE EXCEPTION 'Must start exactly % NFL teams for this league', teams_started;
        END IF;
    ELSE
        IF week_seeded THEN
            SELECT COUNT(*)::INTEGER INTO eligible
            FROM fantasy_team_rosters ftr
            WHERE ftr.fantasy_team_id = p_fantasy_team_id
              AND EXISTS (
                  SELECT 1
                  FROM teams t
                  JOIN matchups m
                    ON (m.team1_id = t.id OR m.team2_id = t.id)
                   AND m.week = p_week
                  WHERE t.uuid_id = ftr.nfl_team_id
              );
            required := LEAST(teams_started, eligible);
        ELSE
            required := teams_started;
        END IF;

        IF submitted != required THEN
            IF week_seeded AND required < teams_started THEN
                RAISE EXCEPTION
                    'Must start exactly % NFL teams this week (% eligible after byes)',
                    required, required;
            ELSE
                RAISE EXCEPTION 'Must start exactly % NFL teams for this league', teams_started;
            END IF;
        END IF;
    END IF;

    IF EXISTS(
        SELECT 1 FROM unnest(COALESCE(p_active_nfl_teams, ARRAY[]::UUID[])) AS lineup_team(nfl_id)
        WHERE NOT EXISTS(
            SELECT 1 FROM fantasy_team_rosters ftr
            WHERE ftr.fantasy_team_id = p_fantasy_team_id
              AND ftr.nfl_team_id = lineup_team.nfl_id
        )
    ) THEN
        RAISE EXCEPTION 'Lineup may only include NFL teams on this fantasy team''s roster';
    END IF;

    INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
    VALUES (p_fantasy_team_id, p_week, COALESCE(p_active_nfl_teams, ARRAY[]::UUID[]), week_locked)
    ON CONFLICT (fantasy_team_id, week)
    DO UPDATE SET
        active_nfl_teams = EXCLUDED.active_nfl_teams,
        is_locked = fantasy_lineups.is_locked OR EXCLUDED.is_locked,
        updated_at = NOW();

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        team_league_id,
        current_user_id,
        'SET',
        'fantasy_lineup',
        p_fantasy_team_id,
        jsonb_build_object(
            'week', p_week,
            'active_nfl_teams', COALESCE(p_active_nfl_teams, ARRAY[]::UUID[]),
            'is_owner_override', current_user_role = 'owner' AND week_locked
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;

COMMENT ON FUNCTION set_fantasy_lineup IS
  'Set a weekly fantasy lineup; per-team kickoff freeze and bye lock for non-owners; when seeded, managers may start LEAST(teams_started, eligible non-bye) including empty; week lock blocks non-owners; is_locked is finalize-owned';

-- ---------------------------------------------------------------------------
-- _finalize_league_week_lineups: allow short/empty auto-fill when byes
-- ---------------------------------------------------------------------------
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
    auto_count INTEGER;
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
        SELECT COALESCE(ARRAY(
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
        ), ARRAY[]::UUID[]) INTO auto_teams;

        auto_count := COALESCE(array_length(auto_teams, 1), 0);

        IF auto_count < teams_started THEN
            IF NOT week_seeded THEN
                RAISE EXCEPTION
                    'Cannot auto-fill lineup for fantasy team %: roster has fewer than % NFL teams',
                    team.id, teams_started;
            END IF;
            -- Seeded week: shortfall is bye relief; persist short or empty lineup.
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
    'Internal: auto-fill incomplete lineups (short/empty OK when seeded bye shortfall), lock lineups + week for one league. No auth — callers must authorize.';
