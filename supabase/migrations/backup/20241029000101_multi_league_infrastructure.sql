-- Multi-League Infrastructure
-- This creates the new table structure for proper multi-league support
-- Requires UUID infrastructure to be in place first

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create leagues table
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

-- Create league_members table
CREATE TABLE IF NOT EXISTS league_members (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (league_id, user_id),
    CONSTRAINT league_members_role_check CHECK (role IN ('owner', 'member'))
);

-- Create fantasy_teams table (the actual league participants)
CREATE TABLE IF NOT EXISTS fantasy_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    manager_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fantasy_teams_league_name_unique UNIQUE(league_id, team_name),
    CONSTRAINT fantasy_teams_league_manager_unique UNIQUE(league_id, manager_user_id)
);

-- Create league_matchups table (fantasy team vs fantasy team)
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

-- Create fantasy_lineups table (which NFL teams each fantasy team starts)
CREATE TABLE IF NOT EXISTS fantasy_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    active_nfl_teams UUID[] NOT NULL DEFAULT '{}',
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fantasy_lineups_team_week_unique UNIQUE(fantasy_team_id, week),
    CONSTRAINT fantasy_lineups_valid_week CHECK (week >= 1 AND week <= 18)
);

-- Create weeks table for week management
CREATE TABLE IF NOT EXISTS weeks (
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    week_number INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (league_id, week_number),
    CONSTRAINT weeks_valid_week CHECK (week_number >= 1 AND week_number <= 18)
);

-- Create audit_logs table for tracking changes
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

-- Add foreign key constraint for fantasy_lineups to reference NFL teams
-- This ensures active_nfl_teams contains valid team UUIDs
-- Note: We can't add array FK constraints directly, so we'll handle this in application logic

-- Create indexes for performance
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

-- Add updated_at trigger for fantasy_lineups
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

-- Grant permissions
GRANT ALL ON leagues TO authenticated;
GRANT ALL ON league_members TO authenticated;
GRANT ALL ON fantasy_teams TO authenticated;
GRANT ALL ON league_matchups TO authenticated;
GRANT ALL ON fantasy_lineups TO authenticated;
GRANT ALL ON weeks TO authenticated;
GRANT ALL ON audit_logs TO authenticated;

-- Add helpful comments
COMMENT ON TABLE leagues IS 'Individual fantasy football leagues';
COMMENT ON TABLE league_members IS 'Users who are members of leagues';
COMMENT ON TABLE fantasy_teams IS 'Fantasy teams within leagues (the actual participants)';
COMMENT ON TABLE league_matchups IS 'Matchups between fantasy teams (no winner stored - calculated from scores)';
COMMENT ON TABLE fantasy_lineups IS 'Which NFL teams each fantasy team starts each week';
COMMENT ON TABLE weeks IS 'Week settings and lock status for each league';
COMMENT ON TABLE audit_logs IS 'Audit trail for league actions';

COMMENT ON COLUMN fantasy_lineups.active_nfl_teams IS 'Array of NFL team UUIDs from teams.uuid_id';
COMMENT ON COLUMN leagues.teams_started_per_week IS 'How many NFL teams each fantasy team starts per week';

-- Create verification function
CREATE OR REPLACE FUNCTION verify_multi_league_infrastructure()
RETURNS TABLE (
    table_name TEXT,
    exists BOOLEAN,
    row_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'leagues'::TEXT,
           EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'leagues'),
           (SELECT COUNT(*) FROM leagues);

    RETURN QUERY
    SELECT 'fantasy_teams'::TEXT,
           EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_teams'),
           (SELECT COUNT(*) FROM fantasy_teams);

    RETURN QUERY
    SELECT 'league_matchups'::TEXT,
           EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'league_matchups'),
           (SELECT COUNT(*) FROM league_matchups);

    RETURN QUERY
    SELECT 'fantasy_lineups'::TEXT,
           EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_lineups'),
           (SELECT COUNT(*) FROM fantasy_lineups);
END;
$$ LANGUAGE plpgsql;