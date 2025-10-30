-- Multi-League RLS Policies Migration
-- Implement Row Level Security for new tables

-- Enable RLS on all new tables
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Leagues table policies
-- Users can read leagues they are members of
CREATE POLICY "Users can read leagues they are members of" ON leagues
    FOR SELECT USING (
        id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- Users can create leagues (they become owners automatically)
CREATE POLICY "Users can create leagues" ON leagues
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND created_by = auth.uid()
    );

-- Only league owners can update leagues
CREATE POLICY "League owners can update leagues" ON leagues
    FOR UPDATE USING (
        id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- League members table policies
-- Users can read league members for leagues they belong to
CREATE POLICY "Users can read league members" ON league_members
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League owners can manage members
CREATE POLICY "League owners can manage members" ON league_members
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Users can be added as members (for invitation redemption)
CREATE POLICY "Users can be added as members" ON league_members
    FOR INSERT WITH CHECK (
        user_id = auth.uid()
    );

-- Team slots table policies
-- Users can read team slots for leagues they belong to
CREATE POLICY "Users can read team slots" ON team_slots
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League owners can manage team slots
CREATE POLICY "League owners can manage team slots" ON team_slots
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Managers can update their own slot
CREATE POLICY "Managers can update their own slot" ON team_slots
    FOR UPDATE USING (
        manager_user_id = auth.uid()
    );

-- Invitations table policies
-- Public read for active invitations (needed for redemption)
CREATE POLICY "Public can read active invitations" ON invitations
    FOR SELECT USING (
        status = 'pending' AND expires_at > NOW()
    );

-- League owners can manage invitations
CREATE POLICY "League owners can manage invitations" ON invitations
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Allow invitation updates for redemption
CREATE POLICY "Allow invitation redemption" ON invitations
    FOR UPDATE USING (
        status = 'pending'
        AND expires_at > NOW()
        AND redeemed_by IS NULL
    ) WITH CHECK (
        redeemed_by = auth.uid()
    );

-- Weeks table policies
-- Users can read weeks for leagues they belong to
CREATE POLICY "Users can read weeks" ON weeks
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League owners can manage weeks
CREATE POLICY "League owners can manage weeks" ON weeks
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- League teams table policies
-- Users can read league teams for leagues they belong to
CREATE POLICY "Users can read league teams" ON league_teams
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid()
        )
    );

-- League owners can manage league teams
CREATE POLICY "League owners can manage league teams" ON league_teams
    FOR ALL USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Audit logs table policies
-- League owners can read audit logs for their leagues
CREATE POLICY "League owners can read audit logs" ON audit_logs
    FOR SELECT USING (
        league_id IN (
            SELECT league_id FROM league_members
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- System can insert audit logs (via RPC functions)
CREATE POLICY "System can insert audit logs" ON audit_logs
    FOR INSERT WITH CHECK (true);

-- Grant necessary permissions for views
GRANT SELECT ON v_league_teams TO authenticated;
GRANT SELECT ON v_league_matchups TO authenticated;
GRANT SELECT ON v_league_lineups TO authenticated;
GRANT SELECT ON v_league_standings TO authenticated;
GRANT SELECT ON v_active_invitations TO authenticated, anon;