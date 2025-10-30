-- Convert existing schema from INTEGER to UUID
-- This migration must run BEFORE the multi-league schema migration

-- Step 1: Add UUID columns alongside existing INTEGER columns
ALTER TABLE teams ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE lineups ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE matchups ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE game_stats ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();
ALTER TABLE league_settings ADD COLUMN uuid_id UUID DEFAULT gen_random_uuid();

-- Step 2: Add UUID foreign key columns
ALTER TABLE lineups ADD COLUMN team_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN team1_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN team2_uuid_id UUID;
ALTER TABLE matchups ADD COLUMN winner_uuid_id UUID;

-- Step 3: Populate the UUID foreign keys using the mapping
UPDATE lineups SET team_uuid_id = teams.uuid_id
FROM teams WHERE lineups.team_id = teams.id;

-- Update team1_uuid_id
UPDATE matchups SET team1_uuid_id = teams.uuid_id
FROM teams
WHERE matchups.team1_id = teams.id;

-- Update team2_uuid_id
UPDATE matchups SET team2_uuid_id = teams.uuid_id
FROM teams
WHERE matchups.team2_id = teams.id;

-- Update winner_uuid_id (only for rows with a winner)
UPDATE matchups SET winner_uuid_id = teams.uuid_id
FROM teams
WHERE matchups.winner_id = teams.id AND matchups.winner_id IS NOT NULL;

-- Step 4: Create new constraints and indexes
CREATE UNIQUE INDEX teams_uuid_id_idx ON teams(uuid_id);
CREATE INDEX lineups_team_uuid_id_idx ON lineups(team_uuid_id);
CREATE INDEX matchups_team1_uuid_id_idx ON matchups(team1_uuid_id);
CREATE INDEX matchups_team2_uuid_id_idx ON matchups(team2_uuid_id);
CREATE INDEX matchups_winner_uuid_id_idx ON matchups(winner_uuid_id);

-- Step 5: Add foreign key constraints
ALTER TABLE lineups ADD CONSTRAINT lineups_team_uuid_id_fkey
    FOREIGN KEY (team_uuid_id) REFERENCES teams(uuid_id);

ALTER TABLE matchups ADD CONSTRAINT matchups_team1_uuid_id_fkey
    FOREIGN KEY (team1_uuid_id) REFERENCES teams(uuid_id);

ALTER TABLE matchups ADD CONSTRAINT matchups_team2_uuid_id_fkey
    FOREIGN KEY (team2_uuid_id) REFERENCES teams(uuid_id);

ALTER TABLE matchups ADD CONSTRAINT matchups_winner_uuid_id_fkey
    FOREIGN KEY (winner_uuid_id) REFERENCES teams(uuid_id);

-- Step 6: Update lineups.active_qbs to use UUIDs
-- First, let's check what type of data is in active_qbs and convert accordingly
-- Create a function that can handle both team names and team IDs

-- Add new UUID-based active_qbs column
ALTER TABLE lineups ADD COLUMN active_qbs_uuid UUID[];

-- Check if active_qbs contains team names or team IDs and convert accordingly
DO $$
DECLARE
    sample_qb TEXT;
    is_numeric BOOLEAN := FALSE;
BEGIN
    -- Get a sample active_qbs value to determine the data type
    SELECT unnest(active_qbs) INTO sample_qb
    FROM lineups
    WHERE active_qbs IS NOT NULL
    AND array_length(active_qbs, 1) > 0
    LIMIT 1;

    IF sample_qb IS NOT NULL THEN
        -- Check if the sample looks like a number
        BEGIN
            PERFORM sample_qb::INTEGER;
            is_numeric := TRUE;
            RAISE NOTICE 'Active QBs appear to be team IDs (integers)';
        EXCEPTION WHEN invalid_text_representation THEN
            is_numeric := FALSE;
            RAISE NOTICE 'Active QBs appear to be team names (strings)';
        END;

        IF is_numeric THEN
            -- Convert from team IDs (integers) to UUIDs
            UPDATE lineups SET active_qbs_uuid = (
                SELECT array_agg(t.uuid_id)
                FROM unnest(active_qbs) AS qb_id
                JOIN teams t ON t.id = qb_id::INTEGER
            ) WHERE active_qbs IS NOT NULL;
        ELSE
            -- Convert from team names (strings) to UUIDs
            UPDATE lineups SET active_qbs_uuid = (
                SELECT array_agg(t.uuid_id)
                FROM unnest(active_qbs) AS qb_name
                JOIN teams t ON (t.name = qb_name OR t.abbreviation = qb_name)
            ) WHERE active_qbs IS NOT NULL;
        END IF;
    ELSE
        RAISE NOTICE 'No active_qbs data found to convert';
    END IF;
END;
$$;

-- Step 7: Add unique constraints for the new UUID columns
ALTER TABLE lineups ADD CONSTRAINT lineups_team_uuid_week_unique
    UNIQUE(team_uuid_id, week);

ALTER TABLE matchups ADD CONSTRAINT matchups_uuid_week_unique
    UNIQUE(week, team1_uuid_id, team2_uuid_id);

-- Step 8: Update lineups to use the new UUID team column for is_locked updates
-- We need to make sure lineups reference teams via UUID
UPDATE lineups SET is_locked = FALSE WHERE is_locked IS NULL;

-- Step 9: Add NOT NULL constraints where appropriate (after data is populated)
-- Note: We'll keep old columns for now to maintain compatibility

-- Step 10: Create indexes for performance
CREATE INDEX lineups_team_uuid_id_week_idx ON lineups(team_uuid_id, week);
CREATE INDEX matchups_week_team_uuids_idx ON matchups(week, team1_uuid_id, team2_uuid_id);

-- Step 11: Update week lock functionality to work with UUID teams
-- Add helper function to get team UUID from league teams
CREATE OR REPLACE FUNCTION get_team_uuid_from_league_team(p_team_id INTEGER)
RETURNS UUID AS $$
DECLARE
    team_uuid UUID;
BEGIN
    SELECT uuid_id INTO team_uuid FROM teams WHERE id = p_team_id;
    RETURN team_uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 12: Create migration views for backward compatibility during transition
CREATE VIEW teams_with_legacy_ids AS
SELECT
    uuid_id as id,
    name,
    abbreviation,
    rosters,
    created_at,
    id as legacy_id
FROM teams;

-- Create view to help with lineup migrations
CREATE VIEW lineups_uuid_view AS
SELECT
    l.id,
    l.team_uuid_id as team_id,
    l.week,
    l.active_qbs_uuid as active_qbs,
    l.is_locked,
    l.created_at,
    t.name as team_name
FROM lineups l
JOIN teams t ON l.team_uuid_id = t.uuid_id;

-- Note: No conversion function to drop since we used inline logic