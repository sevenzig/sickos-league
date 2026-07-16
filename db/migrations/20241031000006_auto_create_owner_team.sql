-- Auto-create fantasy team for league owner when creating a league
-- This ensures the owner always occupies slot 1 without needing an invite

-- Update create_league function to automatically create owner's fantasy team
DROP FUNCTION create_league(text, integer, integer);

CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1,
    owner_team_name TEXT DEFAULT NULL
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
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Get user's email for default team name
    SELECT email INTO current_user_email
    FROM auth.users
    WHERE id = current_user_id;

    -- Create default team name if not provided
    IF owner_team_name IS NULL THEN
        default_team_name := COALESCE(
            split_part(current_user_email, '@', 1) || '''s Team',
            'Team 1'
        );
    ELSE
        default_team_name := owner_team_name;
    END IF;

    -- Create the league
    INSERT INTO leagues (name, season, teams_started_per_week, created_by)
    VALUES (league_name, season, teams_started_per_week, current_user_id)
    RETURNING id INTO new_league_id;

    -- Add creator as owner
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (new_league_id, current_user_id, 'owner');

    -- Automatically create owner's fantasy team (slot 1)
    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (new_league_id, default_team_name, current_user_id);

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
            'teams_started_per_week', teams_started_per_week,
            'owner_team_name', default_team_name
        )
    );

    RETURN new_league_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_league TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION create_league IS 'Create a league and automatically create fantasy team for the owner in slot 1';