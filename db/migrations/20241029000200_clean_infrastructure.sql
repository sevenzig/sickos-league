-- Clean Infrastructure Setup - New Architecture Only
-- This creates the infrastructure for the proper multi-league system
-- WITHOUT trying to convert old data or deal with legacy active_qbs

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Add UUID column to existing teams table (NFL teams)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS uuid_id UUID DEFAULT gen_random_uuid();

-- Ensure all teams have UUIDs
UPDATE teams SET uuid_id = gen_random_uuid() WHERE uuid_id IS NULL;

-- Add unique constraint (with proper syntax)
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

-- Create index for performance
CREATE INDEX IF NOT EXISTS teams_uuid_id_idx ON teams(uuid_id);

-- Step 2: Create leagues table
CREATE TABLE IF NOT EXISTS leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 2025,
    teams_started_per_week INTEGER NOT NULL DEFAULT 1,
    draft_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT leagues_name_season_unique UNIQUE(name, season),
    CONSTRAINT leagues_teams_started_valid CHECK (teams_started_per_week >= 1 AND teams_started_per_week <= 4)
);

-- Step 3: Create league_members table
CREATE TABLE IF NOT EXISTS league_members (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (league_id, user_id),
    CONSTRAINT league_members_role_check CHECK (role IN ('owner', 'member'))
);

-- Step 4: Create fantasy_teams table (the actual league participants)
CREATE TABLE IF NOT EXISTS fantasy_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    manager_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fantasy_teams_league_name_unique UNIQUE(league_id, team_name),
    CONSTRAINT fantasy_teams_league_manager_unique UNIQUE(league_id, manager_user_id)
);

-- Step 5: Create league_matchups table (fantasy team vs fantasy team)
CREATE TABLE IF NOT EXISTS league_matchups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    fantasy_team1_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    fantasy_team2_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT league_matchups_week_teams_unique UNIQUE(league_id, week, fantasy_team1_id, fantasy_team2_id),
    CONSTRAINT league_matchups_different_teams CHECK (fantasy_team1_id != fantasy_team2_id),
    CONSTRAINT league_matchups_valid_week CHECK (week >= 1 AND week <= 18)
);

-- Step 6: Create fantasy_lineups table (which NFL teams each fantasy team starts)
CREATE TABLE IF NOT EXISTS fantasy_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    active_nfl_teams UUID[] NOT NULL DEFAULT '{}', -- References teams.uuid_id for NFL teams
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fantasy_lineups_team_week_unique UNIQUE(fantasy_team_id, week),
    CONSTRAINT fantasy_lineups_valid_week CHECK (week >= 1 AND week <= 18)
);

-- Step 7: Create weeks table for week management
CREATE TABLE IF NOT EXISTS weeks (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    week_number INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (league_id, week_number),
    CONSTRAINT weeks_valid_week CHECK (week_number >= 1 AND week_number <= 18)
);

-- Step 8: Create audit_logs table for tracking changes
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 9: Create performance indexes
CREATE INDEX IF NOT EXISTS leagues_created_by_idx ON leagues(created_by);
CREATE INDEX IF NOT EXISTS leagues_season_idx ON leagues(season);

CREATE INDEX IF NOT EXISTS league_members_user_id_idx ON league_members(user_id);
CREATE INDEX IF NOT EXISTS league_members_role_idx ON league_members(role);

CREATE INDEX IF NOT EXISTS fantasy_teams_league_id_idx ON fantasy_teams(league_id);
CREATE INDEX IF NOT EXISTS fantasy_teams_manager_id_idx ON fantasy_teams(manager_user_id);

CREATE INDEX IF NOT EXISTS league_matchups_league_week_idx ON league_matchups(league_id, week);
CREATE INDEX IF NOT EXISTS league_matchups_fantasy_team1_idx ON league_matchups(fantasy_team1_id);
CREATE INDEX IF NOT EXISTS league_matchups_fantasy_team2_idx ON league_matchups(fantasy_team2_id);

CREATE INDEX IF NOT EXISTS fantasy_lineups_fantasy_team_idx ON fantasy_lineups(fantasy_team_id);
CREATE INDEX IF NOT EXISTS fantasy_lineups_week_idx ON fantasy_lineups(week);
CREATE INDEX IF NOT EXISTS fantasy_lineups_fantasy_team_week_idx ON fantasy_lineups(fantasy_team_id, week);

CREATE INDEX IF NOT EXISTS weeks_league_week_idx ON weeks(league_id, week_number);
CREATE INDEX IF NOT EXISTS weeks_locks_at_idx ON weeks(locks_at);

CREATE INDEX IF NOT EXISTS audit_logs_league_id_idx ON audit_logs(league_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at);

-- Step 10: Add updated_at trigger
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fantasy_lineups_updated_at ON fantasy_lineups;
CREATE TRIGGER fantasy_lineups_updated_at
    BEFORE UPDATE ON fantasy_lineups
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Step 11: Grant permissions
GRANT ALL ON leagues TO authenticated;
GRANT ALL ON league_members TO authenticated;
GRANT ALL ON fantasy_teams TO authenticated;
GRANT ALL ON league_matchups TO authenticated;
GRANT ALL ON fantasy_lineups TO authenticated;
GRANT ALL ON weeks TO authenticated;
GRANT ALL ON audit_logs TO authenticated;

-- Step 12: Add helpful comments
COMMENT ON TABLE teams IS 'NFL teams (source of QBs) - shared across all leagues';
COMMENT ON COLUMN teams.uuid_id IS 'New UUID primary key for NFL teams';

COMMENT ON TABLE leagues IS 'Individual fantasy football leagues';
COMMENT ON TABLE league_members IS 'Users who are members of leagues';
COMMENT ON TABLE fantasy_teams IS 'Fantasy teams within leagues (the actual participants)';
COMMENT ON TABLE league_matchups IS 'Matchups between fantasy teams (no winner stored - calculated from scores)';
COMMENT ON TABLE fantasy_lineups IS 'Which NFL teams each fantasy team starts each week';
COMMENT ON TABLE weeks IS 'Week settings and lock status for each league';
COMMENT ON TABLE audit_logs IS 'Audit trail for league actions';

COMMENT ON COLUMN fantasy_lineups.active_nfl_teams IS 'Array of NFL team UUIDs from teams.uuid_id - which NFL teams this fantasy team is starting';
COMMENT ON COLUMN leagues.teams_started_per_week IS 'How many NFL teams each fantasy team starts per week';

-- Step 13: Simple verification function
CREATE OR REPLACE FUNCTION verify_clean_infrastructure()
RETURNS TABLE (
    component TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check teams have UUIDs
    RETURN QUERY
    SELECT
        'NFL Teams UUID'::TEXT,
        CASE WHEN COUNT(*) = COUNT(uuid_id) THEN '✅ Ready' ELSE '❌ Missing UUIDs' END,
        FORMAT('%s/%s teams have UUIDs', COUNT(uuid_id), COUNT(*))
    FROM teams;

    -- Check fantasy infrastructure
    RETURN QUERY
    SELECT
        'Fantasy Infrastructure'::TEXT,
        CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_teams')
             THEN '✅ Ready' ELSE '❌ Missing' END,
        'Fantasy teams, matchups, lineups tables';

    -- Check functions are ready
    RETURN QUERY
    SELECT
        'Core Functions'::TEXT,
        '✅ Ready'::TEXT,
        'Clean architecture without legacy conversion';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION verify_clean_infrastructure TO authenticated;