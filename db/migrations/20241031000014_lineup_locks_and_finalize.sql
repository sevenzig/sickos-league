-- Phase 3: self-serve weekly lineups.
--
-- 3.1  Managers can lock their own lineup (lock_fantasy_lineup); a locked
--      lineup can no longer be modified by its manager (owner override kept).
--      Opponents' lineups are hidden until the week locks - enforced in
--      get_fantasy_lineups_for_week, not just the UI.
-- 3.2  finalize_week_lineups: commissioner locks every lineup and the week.
-- 3.3  Missed-lineup policy: finalize auto-starts the lowest-pick-number
--      rostered teams for any fantasy team without a complete saved lineup.

-- ---------------------------------------------------------------------------
-- set_fantasy_lineup: add individual lineup-lock check and stop the upsert
-- from un-locking an already-locked lineup. Otherwise identical to
-- 20241031000013_lineup_roster_enforcement.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_fantasy_lineup(
    p_fantasy_team_id UUID,
    p_week INTEGER,
    p_active_nfl_teams UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_league_id UUID;
    is_authorized BOOLEAN;
    week_locked BOOLEAN;
    lineup_locked BOOLEAN;
    teams_started INTEGER;
    current_user_role TEXT;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Get league info and check authorization
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

    -- Check if week is locked
    SELECT COALESCE(w.is_locked, FALSE) INTO week_locked
    FROM weeks w
    WHERE w.league_id = team_league_id AND w.week_number = p_week;

    -- Only allow lineup changes if week is not locked (unless owner override)
    IF week_locked AND current_user_role != 'owner' THEN
        RAISE EXCEPTION 'Cannot modify lineup: Week % is locked', p_week;
    END IF;

    -- An individually locked lineup can only be changed by the owner
    SELECT COALESCE(fl.is_locked, FALSE) INTO lineup_locked
    FROM fantasy_lineups fl
    WHERE fl.fantasy_team_id = p_fantasy_team_id AND fl.week = p_week;

    IF lineup_locked AND current_user_role != 'owner' THEN
        RAISE EXCEPTION 'Cannot modify lineup: lineup for week % is locked', p_week;
    END IF;

    -- Get league settings for teams started per week
    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = team_league_id;

    -- Validate number of NFL teams
    IF array_length(p_active_nfl_teams, 1) != teams_started THEN
        RAISE EXCEPTION 'Must start exactly % NFL teams for this league', teams_started;
    END IF;

    -- Validate that every submitted NFL team is on this fantasy team's roster.
    IF EXISTS(
        SELECT 1 FROM unnest(p_active_nfl_teams) AS lineup_team(nfl_id)
        WHERE NOT EXISTS(
            SELECT 1 FROM fantasy_team_rosters ftr
            WHERE ftr.fantasy_team_id = p_fantasy_team_id
              AND ftr.nfl_team_id = lineup_team.nfl_id
        )
    ) THEN
        RAISE EXCEPTION 'Lineup may only include NFL teams on this fantasy team''s roster';
    END IF;

    -- Upsert fantasy lineup (never un-lock an already-locked lineup)
    INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
    VALUES (p_fantasy_team_id, p_week, p_active_nfl_teams, week_locked)
    ON CONFLICT (fantasy_team_id, week)
    DO UPDATE SET
        active_nfl_teams = EXCLUDED.active_nfl_teams,
        is_locked = fantasy_lineups.is_locked OR EXCLUDED.is_locked,
        updated_at = NOW();

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        team_league_id,
        current_user_id,
        'SET',
        'fantasy_lineup',
        p_fantasy_team_id,
        jsonb_build_object(
            'week', p_week,
            'active_nfl_teams', p_active_nfl_teams,
            'is_owner_override', current_user_role = 'owner' AND (week_locked OR lineup_locked)
        )
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- lock_fantasy_lineup: manager (or owner) locks a saved, complete lineup.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lock_fantasy_lineup(
    p_fantasy_team_id UUID,
    p_week INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_league_id UUID;
    is_authorized BOOLEAN;
    teams_started INTEGER;
    lineup_size INTEGER;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT
        ft.league_id,
        (ft.manager_user_id = current_user_id OR lm.role = 'owner')
    INTO team_league_id, is_authorized
    FROM fantasy_teams ft
    LEFT JOIN league_members lm ON ft.league_id = lm.league_id AND lm.user_id = current_user_id
    WHERE ft.id = p_fantasy_team_id;

    IF team_league_id IS NULL THEN
        RAISE EXCEPTION 'Fantasy team not found';
    END IF;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to lock lineup for this fantasy team';
    END IF;

    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = team_league_id;

    SELECT array_length(fl.active_nfl_teams, 1) INTO lineup_size
    FROM fantasy_lineups fl
    WHERE fl.fantasy_team_id = p_fantasy_team_id AND fl.week = p_week;

    IF lineup_size IS NULL OR lineup_size != teams_started THEN
        RAISE EXCEPTION 'Cannot lock: lineup must have exactly % NFL teams saved', teams_started;
    END IF;

    UPDATE fantasy_lineups
    SET is_locked = TRUE
    WHERE fantasy_team_id = p_fantasy_team_id AND week = p_week;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        team_league_id,
        current_user_id,
        'LOCK',
        'fantasy_lineup',
        p_fantasy_team_id,
        jsonb_build_object('week', p_week)
    );

    RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- finalize_week_lineups: commissioner-only. Auto-fills any missing/incomplete
-- lineup with the team's lowest-pick-number rostered NFL teams, then locks
-- every lineup and the week. Returns the number of auto-filled lineups.
-- ---------------------------------------------------------------------------
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

    -- Auto-fill teams without a complete saved lineup (missed-lineup policy:
    -- start the lowest-pick-number rostered teams; deterministic)
    FOR team IN
        SELECT ft.id
        FROM fantasy_teams ft
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

    -- Lock every lineup for this week in this league
    UPDATE fantasy_lineups
    SET is_locked = TRUE
    WHERE week = p_week
      AND fantasy_team_id IN (
          SELECT id FROM fantasy_teams WHERE league_id = p_league_id
      );

    -- Lock the week itself
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

-- Note: the opponent-lineup-hiding change to get_fantasy_lineups_for_week
-- lives in 20241031000016_lineup_visibility.sql (it must sort after the
-- manager_email cast fix in ...015, which redefines the same function).

GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION lock_fantasy_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_week_lineups TO authenticated;

COMMENT ON FUNCTION lock_fantasy_lineup IS 'Manager/owner locks a saved, complete lineup for a week';
COMMENT ON FUNCTION finalize_week_lineups IS 'Commissioner: auto-fill missing lineups from lowest draft picks, lock all lineups and the week';

-- Verification (see scripts/verify-phase3.mjs for the executable version):
--   -- lock, then a manager edit fails:
--   SELECT lock_fantasy_lineup('<team>', 1);
--   SELECT set_fantasy_lineup('<team>', 1, ARRAY[...]::UUID[]);  -- error (non-owner)
--   -- finalize with a missing lineup auto-fills the lowest draft picks:
--   SELECT finalize_week_lineups('<league>', 1);
