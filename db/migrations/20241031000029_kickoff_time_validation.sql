-- Phase 4: Individual kickoff-time lineup lock.
--
-- 4.1  Add game_time to the NFL matchups table so each game's kickoff can be
--      stored. Populated at stats-import time (or manually by a platform admin).
-- 4.2  get_nfl_kickoff_times(p_week): returns (nfl_team_id UUID, game_time
--      TIMESTAMPTZ) for every team playing that week; used by the frontend to
--      show per-team "Lockout at kickoff" countdowns.
-- 4.3  set_fantasy_lineup: reject submissions (non-owner) for any NFL team
--      whose game has already kicked off (game_time IS NOT NULL AND <= NOW()).
--      Owner can still override.

-- ---------------------------------------------------------------------------
-- 4.1 Schema: game_time on matchups
-- ---------------------------------------------------------------------------
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS game_time TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_matchups_game_time ON matchups(week, game_time);

-- ---------------------------------------------------------------------------
-- 4.2 get_nfl_kickoff_times: RPC for the frontend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_nfl_kickoff_times(p_week INTEGER)
RETURNS TABLE(nfl_team_id UUID, game_time TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT DISTINCT t.uuid_id, m.game_time
    FROM matchups m
    JOIN teams t ON t.id = m.team1_id OR t.id = m.team2_id
    WHERE m.week = p_week
      AND m.game_time IS NOT NULL
    ORDER BY t.uuid_id;
$$;

GRANT EXECUTE ON FUNCTION get_nfl_kickoff_times TO authenticated;

COMMENT ON FUNCTION get_nfl_kickoff_times IS
  'Returns kickoff timestamps (UTC) for every NFL team playing in a given week; used by the lineup UI for per-team lockout countdowns';

-- ---------------------------------------------------------------------------
-- 4.3 set_fantasy_lineup: add per-team kickoff check
-- Body otherwise identical to 20241031000014_lineup_locks_and_finalize.sql
-- (keeps the individual lineup-lock check and week-lock check).
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

    -- Per-team kickoff lock: reject if any submitted team's game has already
    -- kicked off. Only applies to non-owners (owners can always override).
    IF current_user_role != 'owner' THEN
        IF EXISTS (
            SELECT 1
            FROM unnest(p_active_nfl_teams) AS lt(nfl_id)
            JOIN teams t ON t.uuid_id = lt.nfl_id
            JOIN matchups m
              ON (m.team1_id = t.id OR m.team2_id = t.id)
             AND m.week = p_week
             AND m.game_time IS NOT NULL
             AND m.game_time <= NOW()
        ) THEN
            RAISE EXCEPTION 'Cannot start a team whose game has already kicked off';
        END IF;
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

GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;

COMMENT ON FUNCTION set_fantasy_lineup IS
  'Set a weekly fantasy lineup; blocked if the week or lineup is already locked, or if any selected team''s game has already kicked off (non-owner)';

-- Verification (manual):
--   -- Seed game_time in the past for team1 of a matchup:
--   UPDATE matchups SET game_time = NOW() - INTERVAL '1 hour'
--   WHERE week = 1 AND team1_id = (SELECT id FROM teams WHERE name = 'Kansas City');
--
--   -- Then set_fantasy_lineup with that team should raise:
--   --   "Cannot start a team whose game has already kicked off"
