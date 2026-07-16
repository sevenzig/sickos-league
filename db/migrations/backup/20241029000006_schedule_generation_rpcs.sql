-- Schedule Generation RPCs Migration
-- Functions for generating round-robin schedules

-- Function to generate league schedule
CREATE OR REPLACE FUNCTION generate_schedule(league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    team_record RECORD;
    team_ids UUID[];
    team_count INTEGER;
    week_num INTEGER;
    round_num INTEGER;
    matchup_pairs INTEGER[][];
    pair_idx INTEGER;
    team1_id UUID;
    team2_id UUID;
    max_weeks INTEGER := 18;
    rounds_needed INTEGER;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = generate_schedule.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    -- Get all teams mapped to this league (must have actual teams assigned)
    SELECT array_agg(lt.team_id ORDER BY ts.slot_number), COUNT(*)
    INTO team_ids, team_count
    FROM league_teams lt
    JOIN team_slots ts ON lt.slot_id = ts.id
    WHERE lt.league_id = generate_schedule.league_id;

    IF team_count = 0 THEN
        RAISE EXCEPTION 'No teams assigned to league slots yet';
    END IF;

    IF team_count < 2 THEN
        RAISE EXCEPTION 'Need at least 2 teams to generate schedule';
    END IF;

    -- Clear existing matchups for this league
    DELETE FROM matchups
    WHERE team1_uuid_id IN (SELECT unnest(team_ids))
       OR team2_uuid_id IN (SELECT unnest(team_ids));

    -- Calculate how many complete rounds we can fit
    rounds_needed := CEIL(max_weeks::DECIMAL / (team_count - 1));

    -- Generate round-robin pairings
    week_num := 1;

    FOR round_num IN 1..rounds_needed LOOP
        -- Generate pairings for this round using round-robin algorithm
        FOR pair_idx IN 1..(team_count / 2) LOOP
            -- Calculate team indices for this pairing
            DECLARE
                team1_idx INTEGER;
                team2_idx INTEGER;
            BEGIN
                IF pair_idx = 1 THEN
                    -- First team is always fixed at position 1
                    team1_idx := 1;
                    team2_idx := ((round_num - 1) % (team_count - 1)) + 2;
                    IF team2_idx > team_count THEN
                        team2_idx := team2_idx - (team_count - 1);
                    END IF;
                ELSE
                    -- Calculate rotating positions for other pairs
                    team1_idx := ((round_num - 1 + pair_idx - 1) % (team_count - 1)) + 2;
                    team2_idx := ((round_num - 1 - pair_idx + 1) % (team_count - 1)) + 2;

                    IF team1_idx > team_count THEN
                        team1_idx := team1_idx - (team_count - 1);
                    END IF;
                    IF team2_idx > team_count THEN
                        team2_idx := team2_idx - (team_count - 1);
                    END IF;

                    -- Ensure we don't duplicate the fixed pairing
                    IF team1_idx = 1 OR team2_idx = 1 THEN
                        CONTINUE;
                    END IF;
                END IF;

                -- Skip if we've exceeded max weeks
                IF week_num > max_weeks THEN
                    EXIT;
                END IF;

                -- Get actual team IDs
                team1_id := team_ids[team1_idx];
                team2_id := team_ids[team2_idx];

                -- Insert matchup using UUID columns
                INSERT INTO matchups (week, team1_uuid_id, team2_uuid_id, is_complete)
                VALUES (week_num, team1_id, team2_id, FALSE);

                week_num := week_num + 1;
            END;
        END LOOP;

        -- Break if we've filled all weeks
        IF week_num > max_weeks THEN
            EXIT;
        END IF;
    END LOOP;

    -- Handle odd number of teams (bye weeks)
    IF team_count % 2 = 1 THEN
        -- TODO: Implement bye week logic if needed
        RAISE NOTICE 'Odd number of teams detected. Bye weeks not yet implemented.';
    END IF;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        generate_schedule.league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        NULL,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', week_num - 1,
            'rounds', round_num
        )
    );

    RETURN TRUE;
END;
$$;

-- Simplified round-robin function for exactly 8 teams
CREATE OR REPLACE FUNCTION generate_8_team_schedule(league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    team_ids UUID[];
    team_count INTEGER;
    week_num INTEGER;
    matchups_data INTEGER[][] := ARRAY[
        -- Week 1: 1v2, 3v4, 5v6, 7v8
        ARRAY[1,2], ARRAY[3,4], ARRAY[5,6], ARRAY[7,8],
        -- Week 2: 1v3, 2v8, 4v5, 6v7
        ARRAY[1,3], ARRAY[2,8], ARRAY[4,5], ARRAY[6,7],
        -- Week 3: 1v4, 2v7, 3v6, 5v8
        ARRAY[1,4], ARRAY[2,7], ARRAY[3,6], ARRAY[5,8],
        -- Week 4: 1v5, 2v6, 3v8, 4v7
        ARRAY[1,5], ARRAY[2,6], ARRAY[3,8], ARRAY[4,7],
        -- Week 5: 1v6, 2v5, 3v7, 4v8
        ARRAY[1,6], ARRAY[2,5], ARRAY[3,7], ARRAY[4,8],
        -- Week 6: 1v7, 2v4, 3v5, 6v8
        ARRAY[1,7], ARRAY[2,4], ARRAY[3,5], ARRAY[6,8],
        -- Week 7: 1v8, 2v3, 4v6, 5v7
        ARRAY[1,8], ARRAY[2,3], ARRAY[4,6], ARRAY[5,7]
    ];
    i INTEGER;
    matchup_week INTEGER;
    team1_id UUID;
    team2_id UUID;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = generate_8_team_schedule.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    -- Get all teams mapped to this league
    SELECT array_agg(lt.team_id ORDER BY ts.slot_number), COUNT(*)
    INTO team_ids, team_count
    FROM league_teams lt
    JOIN team_slots ts ON lt.slot_id = ts.id
    WHERE lt.league_id = generate_8_team_schedule.league_id;

    IF team_count != 8 THEN
        RAISE EXCEPTION 'This function requires exactly 8 teams. Use generate_schedule for other counts.';
    END IF;

    -- Clear existing matchups for this league
    DELETE FROM matchups
    WHERE team1_uuid_id IN (SELECT unnest(team_ids))
       OR team2_uuid_id IN (SELECT unnest(team_ids));

    -- Generate matchups for weeks 1-7 (complete round-robin)
    FOR week_num IN 1..7 LOOP
        FOR i IN 1..4 LOOP
            team1_id := team_ids[matchups_data[(week_num-1)*4 + i][1]];
            team2_id := team_ids[matchups_data[(week_num-1)*4 + i][2]];

            INSERT INTO matchups (week, team1_uuid_id, team2_uuid_id, is_complete)
            VALUES (week_num, team1_id, team2_id, FALSE);
        END LOOP;
    END LOOP;

    -- Repeat the pattern for weeks 8-14 (second round)
    FOR week_num IN 8..14 LOOP
        matchup_week := week_num - 7;
        FOR i IN 1..4 LOOP
            team1_id := team_ids[matchups_data[(matchup_week-1)*4 + i][1]];
            team2_id := team_ids[matchups_data[(matchup_week-1)*4 + i][2]];

            INSERT INTO matchups (week, team1_uuid_id, team2_uuid_id, is_complete)
            VALUES (week_num, team1_id, team2_id, FALSE);
        END LOOP;
    END LOOP;

    -- Fill remaining weeks 15-18 with partial third round
    FOR week_num IN 15..18 LOOP
        matchup_week := week_num - 14;
        FOR i IN 1..4 LOOP
            team1_id := team_ids[matchups_data[(matchup_week-1)*4 + i][1]];
            team2_id := team_ids[matchups_data[(matchup_week-1)*4 + i][2]];

            INSERT INTO matchups (week, team1_uuid_id, team2_uuid_id, is_complete)
            VALUES (week_num, team1_id, team2_id, FALSE);
        END LOOP;
    END LOOP;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        generate_8_team_schedule.league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        NULL,
        jsonb_build_object(
            'team_count', 8,
            'weeks_generated', 18,
            'schedule_type', 'round_robin_8_team'
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to get league schedule
CREATE OR REPLACE FUNCTION get_league_schedule(league_id UUID)
RETURNS TABLE (
    week INTEGER,
    matchup_id UUID,
    team1_id UUID,
    team1_name TEXT,
    team1_slot INTEGER,
    team2_id UUID,
    team2_name TEXT,
    team2_slot INTEGER,
    team1_score DECIMAL,
    team2_score DECIMAL,
    is_complete BOOLEAN
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
    WHERE lm.league_id = get_league_schedule.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        vlm.week,
        vlm.matchup_id,
        vlm.team1_id,
        vlm.team1_name,
        vlm.team1_slot,
        vlm.team2_id,
        vlm.team2_name,
        vlm.team2_slot,
        vlm.team1_score,
        vlm.team2_score,
        vlm.is_complete
    FROM v_league_matchups vlm
    WHERE vlm.league_id = get_league_schedule.league_id
    ORDER BY vlm.week, vlm.team1_slot;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION generate_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION generate_8_team_schedule TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_schedule TO authenticated;