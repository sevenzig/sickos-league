-- Offline manual matchups: 7-week template + mid-season override.
-- Offline never auto-generates; generate_league_schedule refuses offline;
-- set_league_schedule accepts 28 games for offline (server expands 8–14 with flip).

-- ============================================================
-- start_offline_draft: no auto schedule generation
-- ============================================================

CREATE OR REPLACE FUNCTION start_offline_draft(
    p_league_id UUID,
    p_draft_order UUID[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_draft_status TEXT;
    league_mode TEXT;
    league_format TEXT;
    league_preset UUID[];
    team_ids UUID[];
    team_count INTEGER;
    v_draft_order UUID[];
    pick INTEGER;
    pick_round INTEGER;
    idx_in_round INTEGER;
    order_position INTEGER;
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
        RAISE EXCEPTION 'Only league owners can start the draft';
    END IF;

    SELECT l.draft_status, l.draft_mode, l.draft_order, l.draft_format
    INTO league_draft_status, league_mode, league_preset, league_format
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_mode IS DISTINCT FROM 'offline' THEN
        RAISE EXCEPTION 'start_offline_draft is only for offline drafts';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Draft has already started for this league';
    END IF;

    SELECT array_agg(ft.id), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams ft
    WHERE ft.league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Starting a draft requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    v_draft_order := COALESCE(p_draft_order, league_preset);

    IF v_draft_order IS NULL THEN
        RAISE EXCEPTION 'Offline draft requires a saved draft order';
    END IF;

    IF array_length(v_draft_order, 1) IS DISTINCT FROM 8
       OR (SELECT COUNT(DISTINCT o) FROM unnest(v_draft_order) o) != 8
       OR EXISTS(SELECT 1 FROM unnest(v_draft_order) o WHERE o != ALL(team_ids)) THEN
        RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
    END IF;

    FOR pick IN 1..32 LOOP
        pick_round := ((pick - 1) / 8) + 1;
        idx_in_round := ((pick - 1) % 8) + 1;
        IF league_format = 'linear' THEN
            order_position := idx_in_round;
        ELSE
            order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;
        END IF;

        INSERT INTO draft_picks (league_id, pick_number, round, fantasy_team_id)
        VALUES (p_league_id, pick, pick_round, v_draft_order[order_position]);
    END LOOP;

    UPDATE leagues
    SET draft_status = 'in_progress',
        draft_current_pick = NULL,
        draft_paused = FALSE,
        draft_order = v_draft_order,
        draft_pick_deadline = NULL
    WHERE id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'START',
        'draft',
        p_league_id,
        jsonb_build_object(
            'draft_order', v_draft_order,
            'draft_mode', league_mode,
            'draft_format', league_format
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_offline_draft TO authenticated;

COMMENT ON FUNCTION start_offline_draft IS
    'Start an offline draft: lock joins, create 32 empty pick slots (snake or linear), no clock. Does not generate a schedule.';

-- ============================================================
-- generate_league_schedule: refuse offline (manual path only)
-- ============================================================

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
  'Generate a 14-week round-robin with randomized seating. Requires 8 teams and the owner. Pre-season only. Refuses offline leagues (manual path). Draft start (async/live) calls this when no matchups exist.';

-- ============================================================
-- set_league_schedule: offline 28-game template + mid-season OK
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

    SELECT draft_mode INTO mode FROM leagues WHERE id = p_league_id;
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
        expected_len := 56;
        max_week := 14;
    END IF;

    IF jsonb_typeof(p_matchups) IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_matchups) IS DISTINCT FROM expected_len THEN
        IF mode = 'offline' THEN
            RAISE EXCEPTION 'Offline schedule must contain exactly 28 matchups (7 weeks x 4)';
        ELSE
            RAISE EXCEPTION 'Schedule must contain exactly 56 matchups (14 weeks x 4)';
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
            RAISE EXCEPTION 'Each week 1–14 needs exactly 4 games and 8 distinct teams';
        END IF;
    END IF;

    IF mode = 'offline' THEN
        -- Expand template: weeks 8–14 are weeks 1–7 with sides flipped
        INSERT INTO _sched (week, team1, team2)
        SELECT week + 7, team2, team1
        FROM _sched
        WHERE week BETWEEN 1 AND 7;

        DELETE FROM league_matchups
        WHERE league_id = p_league_id
          AND COALESCE(is_playoff, FALSE) = FALSE
          AND week BETWEEN 1 AND 14;

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
                'source', 'offline_manual',
                'template_weeks', 7,
                'matchups_written', 56
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
            jsonb_build_object('weeks_generated', 14, 'matchups_generated', 56, 'source', 'manual')
        );
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_league_schedule(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION set_league_schedule IS
  'Owner sets the regular-season schedule. Offline: 28 games (weeks 1–7); server expands 8–14 with home/away flipped; mid-season rewrite allowed; playoff rows left alone. Async/live: 56 games, pre-season only.';
