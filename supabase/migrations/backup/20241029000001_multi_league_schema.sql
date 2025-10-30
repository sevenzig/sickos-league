-- Multi-League Schema Migration
-- This migration adds new tables for multi-league support without touching existing tables

-- Enable RLS
ALTER DATABASE postgres SET row_security = on;

-- Create leagues table
CREATE TABLE IF NOT EXISTS leagues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    season INTEGER NOT NULL DEFAULT 2025,
    teams_started_per_week INTEGER NOT NULL DEFAULT 1 CHECK (teams_started_per_week >= 1 AND teams_started_per_week <= 4),
    draft_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create league_members table
CREATE TABLE IF NOT EXISTS league_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, user_id)
);

-- Create team_slots table
CREATE TABLE IF NOT EXISTS team_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 8),
    team_name TEXT,
    manager_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, slot_number)
);

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES team_slots(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'base64url'),
    expires_at TIMESTAMPTZ NOT NULL,
    redeemed_by UUID REFERENCES auth.users(id),
    redeemed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed', 'revoked')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create weeks table for league-specific week management
CREATE TABLE IF NOT EXISTS weeks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week_number INTEGER NOT NULL CHECK (week_number >= 1),
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, week_number)
);

-- Create league_teams mapping table (maps existing teams to league slots)
CREATE TABLE IF NOT EXISTS league_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES team_slots(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(uuid_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, slot_id),
    UNIQUE(league_id, team_id)
);

-- Create audit_logs table for tracking administrative actions
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_league_members_league_id ON league_members(league_id);
CREATE INDEX IF NOT EXISTS idx_league_members_user_id ON league_members(user_id);
CREATE INDEX IF NOT EXISTS idx_league_members_league_user ON league_members(league_id, user_id);

CREATE INDEX IF NOT EXISTS idx_team_slots_league_id ON team_slots(league_id);
CREATE INDEX IF NOT EXISTS idx_team_slots_manager_user_id ON team_slots(manager_user_id);

CREATE INDEX IF NOT EXISTS idx_invitations_code ON invitations(code);
CREATE INDEX IF NOT EXISTS idx_invitations_league_id ON invitations(league_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

CREATE INDEX IF NOT EXISTS idx_weeks_league_id ON weeks(league_id);
CREATE INDEX IF NOT EXISTS idx_weeks_league_week ON weeks(league_id, week_number);

CREATE INDEX IF NOT EXISTS idx_league_teams_league_id ON league_teams(league_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_team_id ON league_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_league_teams_slot_id ON league_teams(slot_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_league_id ON audit_logs(league_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leagues_updated_at
    BEFORE UPDATE ON leagues
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();