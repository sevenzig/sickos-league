-- Phase 1.2: set_fantasy_lineup only accepts NFL teams on the fantasy
-- team's own roster (fantasy_team_rosters), replacing the old "any of the
-- 32 teams" check. Otherwise identical to the version in
-- 20241029000202_clean_functions.sql.

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

    -- Get league settings for teams started per week
    SELECT teams_started_per_week INTO teams_started
    FROM leagues
    WHERE id = team_league_id;

    -- Validate number of NFL teams
    IF array_length(p_active_nfl_teams, 1) != teams_started THEN
        RAISE EXCEPTION 'Must start exactly % NFL teams for this league', teams_started;
    END IF;

    -- Validate that every submitted NFL team is on this fantasy team's roster.
    -- Explicit column alias: a bare `unnest(...) nfl_team_id` would make the
    -- unqualified name inside the subquery resolve to ftr.nfl_team_id instead.
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

    -- Upsert fantasy lineup
    INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
    VALUES (p_fantasy_team_id, p_week, p_active_nfl_teams, week_locked)
    ON CONFLICT (fantasy_team_id, week)
    DO UPDATE SET
        active_nfl_teams = EXCLUDED.active_nfl_teams,
        is_locked = week_locked,
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
            'is_owner_override', current_user_role = 'owner' AND week_locked
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;

-- Verification (run in SQL editor):
--
--   -- Lineup with a non-rostered NFL team raises an exception;
--   -- a rostered lineup of the correct size succeeds.
--   SELECT set_fantasy_lineup('<fantasy-team>', 1, ARRAY['<rostered-nfl-uuid>']::UUID[]);   -- TRUE
--   SELECT set_fantasy_lineup('<fantasy-team>', 1, ARRAY['<unrostered-nfl-uuid>']::UUID[]); -- error
