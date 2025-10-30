-- Development Seed Data for Multi-League Testing
-- This migration adds seed data for development/testing only

-- Only run in development environments
-- This check can be modified based on your environment detection strategy

-- Create a test league (will only work if user exists)
-- Note: In practice, this would be created via the application UI

-- Insert seed data only if we're in a development environment
-- You can adjust this condition based on your needs
DO $$
DECLARE
    test_user_id UUID;
    test_league_id UUID;
    slot_ids UUID[];
    team_record RECORD;
    slot_counter INTEGER := 1;
BEGIN
    -- Check if we're in development by looking for a specific indicator
    -- This could be the presence of test data, environment variables, etc.
    -- For now, we'll seed if there are fewer than 10 users (indicating dev)

    IF (SELECT COUNT(*) FROM auth.users) < 10 THEN
        -- Get the first user (or create a test scenario)
        SELECT id INTO test_user_id FROM auth.users LIMIT 1;

        IF test_user_id IS NOT NULL THEN
            -- Create a test league
            INSERT INTO leagues (name, season, teams_started_per_week, created_by)
            VALUES ('Dev Test League', 2025, 1, test_user_id)
            RETURNING id INTO test_league_id;

            -- Add creator as owner
            INSERT INTO league_members (league_id, user_id, role)
            VALUES (test_league_id, test_user_id, 'owner');

            -- Create 8 team slots
            FOR slot_num IN 1..8 LOOP
                INSERT INTO team_slots (league_id, slot_number, team_name)
                VALUES (test_league_id, slot_num, 'Team ' || slot_num);
            END LOOP;

            -- Get slot IDs for mapping
            SELECT array_agg(id ORDER BY slot_number) INTO slot_ids
            FROM team_slots WHERE league_id = test_league_id;

            -- Map existing teams to league slots (if teams exist)
            FOR team_record IN
                SELECT uuid_id FROM teams ORDER BY name LIMIT 8
            LOOP
                IF slot_counter <= 8 THEN
                    INSERT INTO league_teams (league_id, slot_id, team_id)
                    VALUES (test_league_id, slot_ids[slot_counter], team_record.uuid_id);

                    slot_counter := slot_counter + 1;
                END IF;
            END LOOP;

            -- Create weeks 1-18
            FOR week_num IN 1..18 LOOP
                INSERT INTO weeks (league_id, week_number)
                VALUES (test_league_id, week_num);
            END LOOP;

            RAISE NOTICE 'Development seed data created: League ID %', test_league_id;
        ELSE
            RAISE NOTICE 'No users found - skipping league seed data';
        END IF;
    ELSE
        RAISE NOTICE 'Production environment detected - skipping seed data';
    END IF;
END $$;