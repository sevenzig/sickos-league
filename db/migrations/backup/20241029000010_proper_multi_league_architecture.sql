-- Proper Multi-League Architecture Migration
-- This fixes the fundamental design flaws by properly separating:
-- 1. NFL Teams (source of QBs) - these are shared across all leagues
-- 2. Fantasy Teams (league participants) - these are unique per league

-- Step 1: Create fantasy_teams table (the actual participants in leagues)
CREATE TABLE fantasy_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    manager_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fantasy_teams_league_name_unique UNIQUE(league_id, team_name),
    CONSTRAINT fantasy_teams_league_manager_unique UNIQUE(league_id, manager_user_id)
);

-- Step 2: Create proper league_matchups table (fantasy team vs fantasy team)
CREATE TABLE league_matchups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    fantasy_team1_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    fantasy_team2_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT league_matchups_week_teams_unique UNIQUE(league_id, week, fantasy_team1_id, fantasy_team2_id),
    CONSTRAINT league_matchups_different_teams CHECK (fantasy_team1_id != fantasy_team2_id),
    CONSTRAINT league_matchups_valid_week CHECK (week >= 1 AND week <= 18)
);

-- Step 3: Create fantasy_lineups table (what QBs each fantasy team starts)
CREATE TABLE fantasy_lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    active_nfl_teams UUID[] NOT NULL DEFAULT '{}', -- References teams(uuid_id) for NFL teams
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT fantasy_lineups_team_week_unique UNIQUE(fantasy_team_id, week),
    CONSTRAINT fantasy_lineups_valid_week CHECK (week >= 1 AND week <= 18)
);

-- Step 4: Create indexes for performance
CREATE INDEX fantasy_teams_league_id_idx ON fantasy_teams(league_id);
CREATE INDEX fantasy_teams_manager_id_idx ON fantasy_teams(manager_user_id);
CREATE INDEX league_matchups_league_week_idx ON league_matchups(league_id, week);
CREATE INDEX league_matchups_fantasy_team1_idx ON league_matchups(fantasy_team1_id);
CREATE INDEX league_matchups_fantasy_team2_idx ON league_matchups(fantasy_team2_id);
CREATE INDEX fantasy_lineups_fantasy_team_idx ON fantasy_lineups(fantasy_team_id);
CREATE INDEX fantasy_lineups_week_idx ON fantasy_lineups(week);

-- Step 5: Migrate data from old structure to new structure
-- Convert team_slots to fantasy_teams
INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
SELECT
    ts.league_id,
    ts.team_name,
    ts.manager_user_id
FROM team_slots ts
WHERE ts.manager_user_id IS NOT NULL;

-- Step 6: Migrate lineups to new fantasy_lineups structure
-- This converts the old lineups that referenced NFL teams directly
-- to fantasy_lineups that properly reference fantasy teams
INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
SELECT
    ft.id as fantasy_team_id,
    l.week,
    COALESCE(l.active_qbs_uuid, '{}') as active_nfl_teams,
    COALESCE(l.is_locked, false) as is_locked
FROM lineups l
JOIN league_teams lt ON l.team_uuid_id = lt.team_id
JOIN team_slots ts ON lt.slot_id = ts.id
JOIN fantasy_teams ft ON ft.league_id = ts.league_id AND ft.manager_user_id = ts.manager_user_id
WHERE l.active_qbs_uuid IS NOT NULL;

-- Step 7: Create proper views for the new architecture
CREATE VIEW v_fantasy_teams AS
SELECT
    ft.id,
    ft.league_id,
    ft.team_name,
    ft.manager_user_id,
    u.email as manager_email,
    l.name as league_name,
    ft.created_at
FROM fantasy_teams ft
LEFT JOIN auth.users u ON ft.manager_user_id = u.id
JOIN leagues l ON ft.league_id = l.id;

CREATE VIEW v_fantasy_lineups AS
SELECT
    fl.id,
    fl.fantasy_team_id,
    ft.team_name as fantasy_team_name,
    ft.league_id,
    fl.week,
    fl.active_nfl_teams,
    -- Get NFL team names for display
    ARRAY(
        SELECT t.name
        FROM unnest(fl.active_nfl_teams) WITH ORDINALITY AS nfl_id(id, ord)
        JOIN teams t ON t.uuid_id = nfl_id.id
        ORDER BY nfl_id.ord
    ) as active_nfl_team_names,
    fl.is_locked,
    w.is_locked as week_locked,
    fl.created_at,
    fl.updated_at
FROM fantasy_lineups fl
JOIN fantasy_teams ft ON fl.fantasy_team_id = ft.id
LEFT JOIN weeks w ON w.league_id = ft.league_id AND w.week_number = fl.week;

CREATE VIEW v_league_matchups AS
SELECT
    lm.id,
    lm.league_id,
    l.name as league_name,
    lm.week,
    lm.fantasy_team1_id,
    ft1.team_name as fantasy_team1_name,
    ft1.manager_user_id as team1_manager_id,
    u1.email as team1_manager_email,
    lm.fantasy_team2_id,
    ft2.team_name as fantasy_team2_name,
    ft2.manager_user_id as team2_manager_id,
    u2.email as team2_manager_email,
    w.locks_at,
    w.is_locked as week_locked,
    lm.created_at
FROM league_matchups lm
JOIN leagues l ON lm.league_id = l.id
JOIN fantasy_teams ft1 ON lm.fantasy_team1_id = ft1.id
JOIN fantasy_teams ft2 ON lm.fantasy_team2_id = ft2.id
LEFT JOIN auth.users u1 ON ft1.manager_user_id = u1.id
LEFT JOIN auth.users u2 ON ft2.manager_user_id = u2.id
LEFT JOIN weeks w ON w.league_id = lm.league_id AND w.week_number = lm.week;

-- Step 8: Add audit triggers
CREATE TRIGGER fantasy_lineups_updated_at
    BEFORE UPDATE ON fantasy_lineups
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Step 9: Grant permissions
GRANT ALL ON fantasy_teams TO authenticated;
GRANT ALL ON league_matchups TO authenticated;
GRANT ALL ON fantasy_lineups TO authenticated;
GRANT SELECT ON v_fantasy_teams TO authenticated;
GRANT SELECT ON v_fantasy_lineups TO authenticated;
GRANT SELECT ON v_league_matchups TO authenticated;

-- Step 10: Add Row Level Security
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_lineups ENABLE ROW LEVEL SECURITY;

-- Fantasy teams: Users can see teams in leagues they're members of
CREATE POLICY fantasy_teams_league_members ON fantasy_teams
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League matchups: Users can see matchups in leagues they're members of
CREATE POLICY league_matchups_league_members ON league_matchups
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Fantasy lineups: Users can see lineups in leagues they're members of, edit their own
CREATE POLICY fantasy_lineups_view ON fantasy_lineups
    FOR SELECT USING (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            JOIN league_members lm ON ft.league_id = lm.league_id
            WHERE lm.user_id = auth.uid()
        )
    );

CREATE POLICY fantasy_lineups_edit ON fantasy_lineups
    FOR INSERT, UPDATE, DELETE USING (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            WHERE ft.manager_user_id = auth.uid()
            OR ft.league_id IN (
                SELECT league_id FROM league_members
                WHERE user_id = auth.uid() AND role = 'owner'
            )
        )
    );

-- Add helpful comments
COMMENT ON TABLE fantasy_teams IS 'Fantasy teams are the actual participants in leagues. Each fantasy team belongs to one league and has one manager.';
COMMENT ON TABLE league_matchups IS 'Matchups between fantasy teams within a league for a specific week. No winner field - calculate from scores.';
COMMENT ON TABLE fantasy_lineups IS 'Which NFL teams (QBs) each fantasy team starts each week. References teams(uuid_id) for NFL teams.';
COMMENT ON COLUMN fantasy_lineups.active_nfl_teams IS 'Array of NFL team UUIDs that this fantasy team is starting as QBs this week';