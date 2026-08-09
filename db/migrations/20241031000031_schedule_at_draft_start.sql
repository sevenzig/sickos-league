-- Schedule generation before / at draft start.
--
-- Previously generate_league_schedule required draft_status = 'complete'.
-- Now: commissioner can generate once 8 teams exist; start_draft auto-generates
-- if no matchups exist yet. Seating is randomized (ORDER BY random()).

-- ============================================================
-- Internal impl: no owner check (callable from start_draft / autostart)
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

    -- Pre-season only: once any week is locked or any matchup has a result, freeze.
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

    FOR week_num IN 1..18 LOOP
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

            INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
            VALUES (p_league_id, week_num, team1_id, team2_id);
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
            'weeks_generated', 18,
            'matchups_generated', 72
        )
    );

    RETURN TRUE;
END;
$$;

-- Not granted to authenticated — only SECURITY DEFINER callers (public RPC, start_draft).

-- ============================================================
-- Public RPC: owner-only wrapper
-- ============================================================

CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
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

    RETURN _generate_league_schedule_impl(p_league_id);
END;
$$;

GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;

COMMENT ON FUNCTION generate_league_schedule IS
  'Generate 18-week round-robin schedule with randomized seating; requires 8 teams and owner; pre-season only. Also auto-runs from start_draft when no matchups exist.';

-- ============================================================
-- start_draft: auto-generate schedule if none exists
-- ============================================================

CREATE OR REPLACE FUNCTION start_draft(
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
    league_pick_secs INTEGER;
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

    -- Autostart (server tick / get_draft_state) may run with no JWT user.
    IF current_user_id IS NULL
       AND current_setting('bqbl.draft_autostart', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    -- Autostart path: service tick / get_draft_state may call without owner
    -- via draft_ensure_live_started (SECURITY DEFINER). Direct client calls
    -- still require owner.
    IF NOT is_owner AND current_setting('bqbl.draft_autostart', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Only league owners can start the draft';
    END IF;

    SELECT l.draft_status, l.draft_mode, l.draft_pick_seconds, l.draft_order
    INTO league_draft_status, league_mode, league_pick_secs, league_preset
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

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
        SELECT array_agg(ft.id ORDER BY random())
        INTO v_draft_order
        FROM fantasy_teams ft
        WHERE ft.league_id = p_league_id;
    ELSE
        IF array_length(v_draft_order, 1) IS DISTINCT FROM 8
           OR (SELECT COUNT(DISTINCT o) FROM unnest(v_draft_order) o) != 8
           OR EXISTS(SELECT 1 FROM unnest(v_draft_order) o WHERE o != ALL(team_ids)) THEN
            RAISE EXCEPTION 'Draft order must contain each of the league''s 8 fantasy teams exactly once';
        END IF;
    END IF;

    FOR pick IN 1..32 LOOP
        pick_round := ((pick - 1) / 8) + 1;
        idx_in_round := ((pick - 1) % 8) + 1;
        order_position := CASE WHEN pick_round % 2 = 1 THEN idx_in_round ELSE 9 - idx_in_round END;

        INSERT INTO draft_picks (league_id, pick_number, round, fantasy_team_id)
        VALUES (p_league_id, pick, pick_round, v_draft_order[order_position]);
    END LOOP;

    UPDATE leagues
    SET draft_status = 'in_progress',
        draft_current_pick = 1,
        draft_paused = FALSE,
        draft_order = v_draft_order,
        draft_pick_deadline = CASE
            WHEN league_mode = 'live' THEN NOW() + make_interval(secs => league_pick_secs)
            ELSE NULL
        END
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
            'autostart', current_setting('bqbl.draft_autostart', true) = 'on'
        )
    );

    -- Auto-generate season schedule if the commissioner has not already done so.
    IF NOT EXISTS (
        SELECT 1 FROM league_matchups WHERE league_id = p_league_id LIMIT 1
    ) THEN
        PERFORM _generate_league_schedule_impl(p_league_id);
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION start_draft TO authenticated;

COMMENT ON FUNCTION start_draft IS
  'Start the snake draft: pre-create 32 pick slots; auto-generate schedule if none exists (owner or live autostart)';
