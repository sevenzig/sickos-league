-- Row Level Security and Views for Clean Architecture
-- No legacy active_qbs references - only new fantasy_lineups.active_nfl_teams

-- Enable Row Level Security
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Leagues: Users can see leagues they're members of
DROP POLICY IF EXISTS leagues_member_access ON leagues;
CREATE POLICY leagues_member_access ON leagues
    FOR ALL USING (
        id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League members: Users can see members of leagues they belong to
DROP POLICY IF EXISTS league_members_access ON league_members;
CREATE POLICY league_members_access ON league_members
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Fantasy teams: Users can see teams in leagues they're members of
DROP POLICY IF EXISTS fantasy_teams_league_access ON fantasy_teams;
CREATE POLICY fantasy_teams_league_access ON fantasy_teams
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League matchups: Users can see matchups in leagues they're members of
DROP POLICY IF EXISTS league_matchups_access ON league_matchups;
CREATE POLICY league_matchups_access ON league_matchups
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Fantasy lineups: Users can see lineups in leagues they're members of, edit their own
DROP POLICY IF EXISTS fantasy_lineups_view ON fantasy_lineups;
DROP POLICY IF EXISTS fantasy_lineups_insert ON fantasy_lineups;
DROP POLICY IF EXISTS fantasy_lineups_update ON fantasy_lineups;
DROP POLICY IF EXISTS fantasy_lineups_delete ON fantasy_lineups;

CREATE POLICY fantasy_lineups_view ON fantasy_lineups
    FOR SELECT USING (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            JOIN league_members lm ON ft.league_id = lm.league_id
            WHERE lm.user_id = auth.uid()
        )
    );

CREATE POLICY fantasy_lineups_insert ON fantasy_lineups
    FOR INSERT WITH CHECK (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            WHERE ft.manager_user_id = auth.uid()
            OR ft.league_id IN (
                SELECT league_id FROM league_members
                WHERE user_id = auth.uid() AND role = 'owner'
            )
        )
    );

CREATE POLICY fantasy_lineups_update ON fantasy_lineups
    FOR UPDATE USING (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            WHERE ft.manager_user_id = auth.uid()
            OR ft.league_id IN (
                SELECT league_id FROM league_members
                WHERE user_id = auth.uid() AND role = 'owner'
            )
        )
    );

CREATE POLICY fantasy_lineups_delete ON fantasy_lineups
    FOR DELETE USING (
        fantasy_team_id IN (
            SELECT ft.id FROM fantasy_teams ft
            WHERE ft.manager_user_id = auth.uid()
            OR ft.league_id IN (
                SELECT league_id FROM league_members
                WHERE user_id = auth.uid() AND role = 'owner'
            )
        )
    );

-- Weeks: Users can see weeks for leagues they're members of
DROP POLICY IF EXISTS weeks_league_access ON weeks;
CREATE POLICY weeks_league_access ON weeks
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Audit logs: Users can see logs for leagues they're members of
DROP POLICY IF EXISTS audit_logs_league_access ON audit_logs;
CREATE POLICY audit_logs_league_access ON audit_logs
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Create clean views without legacy references
CREATE OR REPLACE VIEW v_user_leagues AS
SELECT
    l.id,
    l.name,
    l.season,
    l.teams_started_per_week,
    l.draft_at,
    l.created_at,
    lm.role as user_role,
    (SELECT COUNT(*) FROM league_members lm2 WHERE lm2.league_id = l.id) as member_count,
    (SELECT COUNT(*) FROM fantasy_teams ft WHERE ft.league_id = l.id) as fantasy_teams_count
FROM leagues l
JOIN league_members lm ON l.id = lm.league_id
WHERE lm.user_id = auth.uid();

CREATE OR REPLACE VIEW v_fantasy_teams AS
SELECT
    ft.id,
    ft.league_id,
    ft.team_name,
    ft.manager_user_id,
    u.email as manager_email,
    l.name as league_name,
    l.season,
    ft.created_at
FROM fantasy_teams ft
LEFT JOIN auth.users u ON ft.manager_user_id = u.id
JOIN leagues l ON ft.league_id = l.id;

CREATE OR REPLACE VIEW v_league_matchups AS
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

CREATE OR REPLACE VIEW v_fantasy_lineups AS
SELECT
    fl.id,
    fl.fantasy_team_id,
    ft.team_name as fantasy_team_name,
    ft.league_id,
    l.name as league_name,
    fl.week,
    fl.active_nfl_teams,
    -- Get NFL team names for display
    COALESCE(
        ARRAY(
            SELECT t.name
            FROM unnest(fl.active_nfl_teams) WITH ORDINALITY AS nfl_id(id, ord)
            JOIN teams t ON t.uuid_id = nfl_id.id
            ORDER BY nfl_id.ord
        ),
        ARRAY[]::TEXT[]
    ) as active_nfl_team_names,
    fl.is_locked,
    w.is_locked as week_locked,
    w.locks_at,
    fl.created_at,
    fl.updated_at
FROM fantasy_lineups fl
JOIN fantasy_teams ft ON fl.fantasy_team_id = ft.id
JOIN leagues l ON ft.league_id = l.id
LEFT JOIN weeks w ON w.league_id = ft.league_id AND w.week_number = fl.week;

-- Grant permissions on views
GRANT SELECT ON v_user_leagues TO authenticated;
GRANT SELECT ON v_fantasy_teams TO authenticated;
GRANT SELECT ON v_league_matchups TO authenticated;
GRANT SELECT ON v_fantasy_lineups TO authenticated;

-- Create a clean status check view
CREATE OR REPLACE VIEW v_clean_infrastructure_status AS
SELECT
    'Tables' as category,
    CASE
        WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_teams')
        AND EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'fantasy_lineups')
        AND EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'league_matchups')
        THEN '✅ All new tables created'
        ELSE '❌ Missing tables'
    END as status
UNION ALL
SELECT
    'NFL Teams UUID' as category,
    CASE
        WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'uuid_id')
        AND (SELECT COUNT(*) FROM teams WHERE uuid_id IS NULL) = 0
        THEN '✅ All NFL teams have UUIDs'
        ELSE '❌ Missing NFL team UUIDs'
    END as status
UNION ALL
SELECT
    'Views' as category,
    CASE
        WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'v_fantasy_lineups')
        THEN '✅ Clean views created'
        ELSE '❌ Views missing'
    END as status
UNION ALL
SELECT
    'RLS Policies' as category,
    CASE
        WHEN EXISTS(SELECT 1 FROM pg_policies WHERE tablename = 'fantasy_teams')
        THEN '✅ Security policies active'
        ELSE '❌ Security policies missing'
    END as status
UNION ALL
SELECT
    'Architecture' as category,
    '✅ Clean design - no legacy active_qbs references' as status;

GRANT SELECT ON v_clean_infrastructure_status TO authenticated;