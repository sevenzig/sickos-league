-- Add missing schedule generation functionality
-- This adds the generate_league_schedule function and supporting functions

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
    matches_per_week INTEGER;
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

    -- Generate round-robin schedule
    week_num := 1;

    -- For round-robin, each team plays each other team once
    -- This creates (team_count * (team_count - 1)) / 2 unique matchups
    FOR i IN 1..team_count LOOP
        FOR j IN (i + 1)..team_count LOOP
            IF week_num > 18 THEN EXIT; END IF; -- Don't exceed 18 weeks

            team1_id := team_ids[i];
            team2_id := team_ids[j];

            -- Create the matchup
            INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
            VALUES (p_league_id, week_num, team1_id, team2_id);

            week_num := week_num + 1;
        END LOOP;
    END LOOP;

    -- If we have too few matchups to fill 18 weeks, repeat the cycle
    IF week_num <= 18 AND team_count >= 4 THEN
        -- Second round of matchups (reverse home/away)
        FOR i IN 1..team_count LOOP
            FOR j IN (i + 1)..team_count LOOP
                IF week_num > 18 THEN EXIT; END IF;

                team1_id := team_ids[j]; -- Reverse order for second round
                team2_id := team_ids[i];

                INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
                VALUES (p_league_id, week_num, team1_id, team2_id);

                week_num := week_num + 1;
            END LOOP;
        END LOOP;
    END IF;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        p_league_id,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', week_num - 1
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to get league schedule (already exists but ensuring it's here)
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
BEGIN
    RETURN QUERY
    SELECT
        lm.id,
        lm.week,
        lm.fantasy_team1_id,
        ft1.team_name as fantasy_team1_name,
        u1.email as team1_manager_email,
        lm.fantasy_team2_id,
        ft2.team_name as fantasy_team2_name,
        u2.email as team2_manager_email,
        w.locks_at,
        COALESCE(w.is_locked, FALSE) as week_locked
    FROM league_matchups lm
    JOIN fantasy_teams ft1 ON lm.fantasy_team1_id = ft1.id
    JOIN fantasy_teams ft2 ON lm.fantasy_team2_id = ft2.id
    LEFT JOIN auth.users u1 ON ft1.manager_user_id = u1.id
    LEFT JOIN auth.users u2 ON ft2.manager_user_id = u2.id
    LEFT JOIN weeks w ON lm.league_id = w.league_id AND lm.week = w.week_number
    WHERE lm.league_id = p_league_id
      AND (p_week IS NULL OR lm.week = p_week)
    ORDER BY lm.week, lm.id;
END;
$$;

-- Function to get league fantasy teams (ensure this exists)
-- (must drop first: the return type changes, which CREATE OR REPLACE rejects)
DROP FUNCTION IF EXISTS get_league_fantasy_teams(UUID);

CREATE OR REPLACE FUNCTION get_league_fantasy_teams(p_league_id UUID)
RETURNS TABLE (
    id UUID,
    league_id UUID,
    team_name TEXT,
    manager_user_id UUID,
    manager_email TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.league_id,
        ft.team_name,
        ft.manager_user_id,
        u.email as manager_email,
        ft.created_at
    FROM fantasy_teams ft
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE ft.league_id = p_league_id
    ORDER BY ft.created_at;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_fantasy_teams TO authenticated;

-- Add helpful comments
COMMENT ON FUNCTION generate_league_schedule IS 'Generate round-robin schedule for a league (league owners only)';
COMMENT ON FUNCTION get_league_schedule IS 'Get schedule for a league with optional week filter';
COMMENT ON FUNCTION get_league_fantasy_teams IS 'Get all fantasy teams in a league';