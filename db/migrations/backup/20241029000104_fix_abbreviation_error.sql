-- Fix Migration Error: Remove problematic DO block that references non-existent abbreviation column
-- This cleans up any issues from the previous migration attempt

-- First, let's make sure we have the basic UUID infrastructure
-- Add UUID column to teams if it doesn't exist
ALTER TABLE teams ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

-- Ensure all teams have UUIDs
UPDATE teams SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'teams_uuid_id_unique'
        AND table_name = 'teams'
    ) THEN
        ALTER TABLE teams ADD CONSTRAINT teams_uuid_id_unique UNIQUE(uuid_id);
    END IF;
END $$;

-- Create or replace the helper function with correct column reference
CREATE OR REPLACE FUNCTION get_team_uuid_by_name(team_name TEXT)
RETURNS UUID AS $$
DECLARE
    team_uuid UUID;
BEGIN
    -- Only use the name column since abbreviation doesn't exist
    SELECT uuid_id INTO team_uuid
    FROM teams
    WHERE name = team_name;

    RETURN team_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create a simple function to convert active_qbs arrays to UUIDs when ready
CREATE OR REPLACE FUNCTION convert_active_qbs_to_uuids()
RETURNS INTEGER AS $$
DECLARE
    converted_count INTEGER := 0;
    lineup_record RECORD;
    team_names TEXT[];
    team_uuids UUID[];
    team_name TEXT;
    team_uuid UUID;
BEGIN
    -- Process each lineup that has active_qbs but not active_qbs_uuid
    FOR lineup_record IN
        SELECT id, active_qbs
        FROM lineups
        WHERE active_qbs IS NOT NULL
        AND active_qbs_uuid IS NULL
    LOOP
        team_names := lineup_record.active_qbs;
        team_uuids := '{}';

        -- Convert each team name to UUID
        FOREACH team_name IN ARRAY team_names
        LOOP
            SELECT get_team_uuid_by_name(team_name) INTO team_uuid;
            IF team_uuid IS NOT NULL THEN
                team_uuids := array_append(team_uuids, team_uuid);
            ELSE
                RAISE NOTICE 'Could not find team UUID for name: %', team_name;
            END IF;
        END LOOP;

        -- Update the lineup with UUIDs
        UPDATE lineups
        SET active_qbs_uuid = team_uuids
        WHERE id = lineup_record.id;

        converted_count := converted_count + 1;
    END LOOP;

    RETURN converted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_team_uuid_by_name TO authenticated;
GRANT EXECUTE ON FUNCTION convert_active_qbs_to_uuids TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION convert_active_qbs_to_uuids IS 'Converts active_qbs team names to UUIDs. Run this after ensuring all teams have proper UUIDs.';

-- Create verification function
CREATE OR REPLACE FUNCTION verify_teams_uuid_status()
RETURNS TABLE (
    total_teams INTEGER,
    teams_with_uuid INTEGER,
    teams_missing_uuid INTEGER,
    sample_team_names TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_teams,
        COUNT(uuid_id)::INTEGER as teams_with_uuid,
        (COUNT(*) - COUNT(uuid_id))::INTEGER as teams_missing_uuid,
        array_agg(name ORDER BY name LIMIT 5) as sample_team_names
    FROM teams;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION verify_teams_uuid_status TO authenticated;