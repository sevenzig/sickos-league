-- Core RPC Functions for Multi-League System
-- These are the essential functions needed for basic multi-league operations

-- Function to create a new league
CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_league_id UUID;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Create the league
    INSERT INTO leagues (name, season, teams_started_per_week, created_by)
    VALUES (league_name, season, teams_started_per_week, current_user_id)
    RETURNING id INTO new_league_id;

    -- Add creator as owner
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (new_league_id, current_user_id, 'owner');

    -- Create weeks 1-18
    INSERT INTO weeks (league_id, week_number)
    SELECT new_league_id, generate_series(1, 18);

    -- Log the action
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
            'teams_started_per_week', teams_started_per_week
        )
    );

    RETURN new_league_id;
END;
$$;

-- Function to create a fantasy team
CREATE OR REPLACE FUNCTION create_fantasy_team(
    p_league_id UUID,
    p_team_name TEXT,
    p_manager_user_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_team_id UUID;
    is_authorized BOOLEAN;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Use provided manager or default to current user
    p_manager_user_id := COALESCE(p_manager_user_id, current_user_id);

    -- Check if user is authorized (league owner or creating for themselves as member)
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = current_user_id
          AND (role = 'owner' OR (user_id = p_manager_user_id AND role IN ('member', 'owner')))
    ) INTO is_authorized;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to create fantasy team in this league';
    END IF;

    -- Create the fantasy team
    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (p_league_id, p_team_name, p_manager_user_id)
    RETURNING id INTO new_team_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'CREATE',
        'fantasy_team',
        new_team_id,
        jsonb_build_object(
            'team_name', p_team_name,
            'manager_user_id', p_manager_user_id
        )
    );

    RETURN new_team_id;
END;
$$;

-- Function to set fantasy lineup
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

    -- Validate that all NFL teams exist (basic check)
    IF EXISTS(
        SELECT 1 FROM unnest(p_active_nfl_teams) nfl_team_id
        WHERE NOT EXISTS(SELECT 1 FROM teams WHERE uuid_id = nfl_team_id)
    ) THEN
        RAISE EXCEPTION 'Invalid NFL team ID provided';
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

-- Function to get user's leagues
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
    fantasy_teams_count BIGINT
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

-- Function to get league details
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
    fantasy_teams_count BIGINT
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

    -- Check if user is a member of this league
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

-- Function to get fantasy teams in a league
CREATE OR REPLACE FUNCTION get_league_fantasy_teams(p_league_id UUID)
RETURNS TABLE (
    id UUID,
    team_name TEXT,
    manager_user_id UUID,
    manager_email TEXT,
    created_at TIMESTAMPTZ
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

    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = p_league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        ft.id,
        ft.team_name,
        ft.manager_user_id,
        u.email,
        ft.created_at
    FROM fantasy_teams ft
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE ft.league_id = p_league_id
    ORDER BY ft.team_name;
END;
$$;

-- Function to toggle week lock
CREATE OR REPLACE FUNCTION toggle_week_lock(
    p_league_id UUID,
    p_week_number INTEGER,
    p_lock_state BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    current_user_id UUID;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = current_user_id
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can lock/unlock weeks';
    END IF;

    -- Update week lock status
    UPDATE weeks
    SET is_locked = p_lock_state
    WHERE league_id = p_league_id
      AND week_number = p_week_number;

    -- If we're locking, also lock all lineups for this week in this league
    IF p_lock_state THEN
        UPDATE fantasy_lineups
        SET is_locked = TRUE
        WHERE week = p_week_number
          AND fantasy_team_id IN (
              SELECT id FROM fantasy_teams
              WHERE league_id = p_league_id
          );
    END IF;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        CASE WHEN p_lock_state THEN 'LOCK' ELSE 'UNLOCK' END,
        'week',
        NULL,
        jsonb_build_object('week_number', p_week_number)
    );

    RETURN TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_league TO authenticated;
GRANT EXECUTE ON FUNCTION create_fantasy_team TO authenticated;
GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_leagues TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_fantasy_teams TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_week_lock TO authenticated;