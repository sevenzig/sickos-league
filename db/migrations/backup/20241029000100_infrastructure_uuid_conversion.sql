-- Infrastructure-Only UUID Conversion
-- This migration focuses on adding UUID infrastructure without converting existing data
-- Seed data will be provided separately after infrastructure is stable

-- Step 1: Add UUID columns to existing tables (without trying to populate them)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

-- Add UUID foreign key columns for relationships
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS team_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS team1_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS team2_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN IF NOT EXISTS winner_uuid_id UUID;

-- Add UUID column for active_qbs conversion
ALTER TABLE lineups ADD COLUMN IF NOT EXISTS active_qbs_uuid UUID[];

-- Step 2: Create indexes for UUID columns (for performance)
CREATE INDEX IF NOT EXISTS teams_uuid_id_idx ON teams(uuid_id);
CREATE INDEX IF NOT EXISTS lineups_team_uuid_id_idx ON lineups(team_uuid_id);
CREATE INDEX IF NOT EXISTS matchups_team1_uuid_id_idx ON matchups(team1_uuid_id);
CREATE INDEX IF NOT EXISTS matchups_team2_uuid_id_idx ON matchups(team2_uuid_id);
CREATE INDEX IF NOT EXISTS matchups_winner_uuid_id_idx ON matchups(winner_uuid_id);
CREATE INDEX IF NOT EXISTS lineups_team_uuid_week_idx ON lineups(team_uuid_id, week);

-- Step 3: Create unique constraint on teams.uuid_id
-- First ensure all teams have UUIDs
UPDATE teams SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

-- Now add unique constraint
ALTER TABLE teams ADD CONSTRAINT IF NOT EXISTS teams_uuid_id_unique UNIQUE(uuid_id);

-- Step 4: Add foreign key constraints (they will be empty initially, populated by seed data)
-- Only add constraints if they don't exist
DO $$
BEGIN
    -- Check and add lineups team constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'lineups_team_uuid_id_fkey'
    ) THEN
        ALTER TABLE lineups ADD CONSTRAINT lineups_team_uuid_id_fkey
            FOREIGN KEY (team_uuid_id) REFERENCES teams(uuid_id);
    END IF;

    -- Check and add matchups team1 constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'matchups_team1_uuid_id_fkey'
    ) THEN
        ALTER TABLE matchups ADD CONSTRAINT matchups_team1_uuid_id_fkey
            FOREIGN KEY (team1_uuid_id) REFERENCES teams(uuid_id);
    END IF;

    -- Check and add matchups team2 constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'matchups_team2_uuid_id_fkey'
    ) THEN
        ALTER TABLE matchups ADD CONSTRAINT matchups_team2_uuid_id_fkey
            FOREIGN KEY (team2_uuid_id) REFERENCES teams(uuid_id);
    END IF;

    -- Check and add matchups winner constraint
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'matchups_winner_uuid_id_fkey'
    ) THEN
        ALTER TABLE matchups ADD CONSTRAINT matchups_winner_uuid_id_fkey
            FOREIGN KEY (winner_uuid_id) REFERENCES teams(uuid_id);
    END IF;
END $$;

-- Step 5: Create helper function for future data migration
CREATE OR REPLACE FUNCTION get_team_uuid_by_name(team_name TEXT)
RETURNS UUID AS $$
DECLARE
    team_uuid UUID;
BEGIN
    SELECT uuid_id INTO team_uuid
    FROM teams
    WHERE name = team_name;

    RETURN team_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 6: Create helper function for future active_qbs conversion
CREATE OR REPLACE FUNCTION convert_team_names_to_uuids(team_names TEXT[])
RETURNS UUID[] AS $$
DECLARE
    result UUID[] := '{}';
    team_name TEXT;
    team_uuid UUID;
BEGIN
    FOREACH team_name IN ARRAY team_names
    LOOP
        SELECT get_team_uuid_by_name(team_name) INTO team_uuid;
        IF team_uuid IS NOT NULL THEN
            result := array_append(result, team_uuid);
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 7: Fix any existing migration attempts that referenced non-existent abbreviation column
-- Remove the problematic DO block from the old migration if it exists

-- Step 7: Grant permissions on helper functions
GRANT EXECUTE ON FUNCTION get_team_uuid_by_name TO authenticated;
GRANT EXECUTE ON FUNCTION convert_team_names_to_uuids TO authenticated;

-- Add helpful comments
COMMENT ON COLUMN teams.uuid_id IS 'New UUID primary key for teams, will replace integer id';
COMMENT ON COLUMN lineups.team_uuid_id IS 'References teams.uuid_id instead of teams.id';
COMMENT ON COLUMN lineups.active_qbs_uuid IS 'UUID array version of active_qbs for NFL teams';
COMMENT ON COLUMN matchups.team1_uuid_id IS 'References teams.uuid_id for team1';
COMMENT ON COLUMN matchups.team2_uuid_id IS 'References teams.uuid_id for team2';
COMMENT ON COLUMN matchups.winner_uuid_id IS 'References teams.uuid_id for winner';

-- Create a simple verification function
CREATE OR REPLACE FUNCTION verify_uuid_infrastructure()
RETURNS TABLE (
    table_name TEXT,
    uuid_column_exists BOOLEAN,
    index_exists BOOLEAN,
    constraint_exists BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'teams'::TEXT,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'uuid_id'),
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'teams' AND indexname = 'teams_uuid_id_idx'),
        EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'teams' AND constraint_name = 'teams_uuid_id_unique');

    RETURN QUERY
    SELECT
        'lineups'::TEXT,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'lineups' AND column_name = 'team_uuid_id'),
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'lineups' AND indexname = 'lineups_team_uuid_id_idx'),
        EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'lineups' AND constraint_name = 'lineups_team_uuid_id_fkey');

    RETURN QUERY
    SELECT
        'matchups'::TEXT,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'matchups' AND column_name = 'team1_uuid_id'),
        EXISTS(SELECT 1 FROM pg_indexes WHERE tablename = 'matchups' AND indexname = 'matchups_team1_uuid_id_idx'),
        EXISTS(SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'matchups' AND constraint_name = 'matchups_team1_uuid_id_fkey');
END;
$$ LANGUAGE plpgsql;