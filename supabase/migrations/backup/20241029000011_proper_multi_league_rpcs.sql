-- Updated RPCs for Proper Multi-League Architecture
-- These functions work with the new fantasy_teams and league_matchups structure

-- Function to create a fantasy team in a league
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
    current_user_id := COALESCE(p_manager_user_id, auth.uid());

    -- Check if user is authorized (league owner or creating for themselves)
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = auth.uid()
          AND (role = 'owner' OR (user_id = current_user_id AND role IN ('member', 'owner')))
    ) INTO is_authorized;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to create fantasy team in this league';
    END IF;

    -- Create the fantasy team
    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (p_league_id, p_team_name, current_user_id)
    RETURNING id INTO new_team_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'CREATE',
        'fantasy_team',
        new_team_id,
        jsonb_build_object(
            'team_name', p_team_name,
            'manager_user_id', current_user_id
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
BEGIN
    -- Get league info and check authorization
    SELECT
        ft.league_id,
        (ft.manager_user_id = auth.uid() OR lm.role = 'owner'),
        lm.role
    INTO team_league_id, is_authorized, current_user_role
    FROM fantasy_teams ft
    LEFT JOIN league_members lm ON ft.league_id = lm.league_id AND lm.user_id = auth.uid()
    WHERE ft.id = p_fantasy_team_id;

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

    -- Validate that all NFL teams exist
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
        auth.uid(),
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

-- Function to generate schedule for a league
CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    team_count INTEGER;
    team_ids UUID[];
    weeks_to_generate INTEGER[];
    week_num INTEGER;
    round_num INTEGER;
    i INTEGER;
    j INTEGER;
    team1_id UUID;
    team2_id UUID;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    -- Get fantasy teams in this league
    SELECT array_agg(id ORDER BY team_name), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count < 2 THEN
        RAISE EXCEPTION 'Need at least 2 fantasy teams to generate schedule';
    END IF;

    -- Clear existing matchups
    DELETE FROM league_matchups WHERE league_id = p_league_id;

    -- Generate weeks (assuming 18 week season)
    weeks_to_generate := ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18];

    -- Round-robin schedule generation
    week_num := 1;

    FOR round_num IN 1..((team_count - 1) * 2) LOOP -- Each team plays each other twice
        IF week_num > 18 THEN EXIT; END IF; -- Don't exceed 18 weeks

        -- Generate matchups for this round
        FOR i IN 1..(team_count/2) LOOP
            j := team_count + 1 - i;

            IF i != j AND i <= team_count AND j <= team_count THEN
                team1_id := team_ids[i];
                team2_id := team_ids[j];

                -- Insert matchup
                INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
                VALUES (p_league_id, week_num, team1_id, team2_id);
            END IF;
        END LOOP;

        -- Rotate teams for next round (keep first team fixed, rotate others)
        IF team_count > 2 THEN
            team_ids := team_ids[1:1] || team_ids[3:] || team_ids[2:2];
        END IF;

        week_num := week_num + 1;
    END LOOP;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        NULL,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', week_num - 1
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to get league fantasy teams
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

-- Function to get league schedule
CREATE OR REPLACE FUNCTION get_league_schedule(
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
    week_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
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
        vlm.id,
        vlm.week,
        vlm.fantasy_team1_id,
        vlm.fantasy_team1_name,
        vlm.team1_manager_email,
        vlm.fantasy_team2_id,
        vlm.fantasy_team2_name,
        vlm.team2_manager_email,
        vlm.locks_at,
        vlm.week_locked
    FROM v_league_matchups vlm
    WHERE vlm.league_id = p_league_id
      AND (p_week IS NULL OR vlm.week = p_week)
    ORDER BY vlm.week, vlm.fantasy_team1_name;
END;
$$;

-- Function to get fantasy lineups for a week
CREATE OR REPLACE FUNCTION get_fantasy_lineups_for_week(
    p_league_id UUID,
    p_week INTEGER
)
RETURNS TABLE (
    fantasy_team_id UUID,
    fantasy_team_name TEXT,
    manager_email TEXT,
    active_nfl_teams UUID[],
    active_nfl_team_names TEXT[],
    is_locked BOOLEAN,
    week_locked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
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
        vfl.fantasy_team_id,
        vfl.fantasy_team_name,
        u.email,
        COALESCE(vfl.active_nfl_teams, ARRAY[]::UUID[]),
        COALESCE(vfl.active_nfl_team_names, ARRAY[]::TEXT[]),
        COALESCE(vfl.is_locked, FALSE),
        COALESCE(vfl.week_locked, FALSE)
    FROM v_fantasy_lineups vfl
    JOIN fantasy_teams ft ON vfl.fantasy_team_id = ft.id
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE vfl.league_id = p_league_id
      AND vfl.week = p_week
    ORDER BY vfl.fantasy_team_name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_fantasy_team TO authenticated;
GRANT EXECUTE ON FUNCTION set_fantasy_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_fantasy_teams TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_fantasy_lineups_for_week TO authenticated;