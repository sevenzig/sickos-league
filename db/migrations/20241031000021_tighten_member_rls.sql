-- Phase 6.1: tighten multi-league table policies.
-- Mutations go through SECURITY DEFINER RPCs; clients should not UPDATE/DELETE
-- league rows directly via /api/db/query.

-- leagues: members read; writes only via RPCs (SECURITY DEFINER)
DROP POLICY IF EXISTS leagues_member_access ON leagues;
CREATE POLICY leagues_member_select ON leagues
    FOR SELECT USING (
        id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
    );

-- league_members: members read; writes via RPCs
DROP POLICY IF EXISTS league_members_access ON league_members;
CREATE POLICY league_members_select ON league_members
    FOR SELECT USING (
        league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
    );

-- fantasy_teams: members read; name/logo updates via RPCs / photos endpoint
DROP POLICY IF EXISTS fantasy_teams_league_access ON fantasy_teams;
CREATE POLICY fantasy_teams_select ON fantasy_teams
    FOR SELECT USING (
        league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
    );

-- league_matchups: members read; scores via finalize_week_scores
DROP POLICY IF EXISTS league_matchups_access ON league_matchups;
CREATE POLICY league_matchups_select ON league_matchups
    FOR SELECT USING (
        league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
    );

-- weeks: members read; locks via set_week_lock RPC
DROP POLICY IF EXISTS weeks_league_access ON weeks;
CREATE POLICY weeks_select ON weeks
    FOR SELECT USING (
        league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
    );

-- audit_logs: members read (actor policy from 00018 may also apply); no client writes
DROP POLICY IF EXISTS audit_logs_league_access ON audit_logs;
DROP POLICY IF EXISTS audit_logs_actor_access ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (
        league_id IN (SELECT league_id FROM league_members WHERE user_id = auth.uid())
        OR user_id = auth.uid()
        OR auth.is_platform_admin()
    );

-- league_invitations: drop any FOR ALL if present; keep invite RPCs as writer
-- (existing policies from invite migration are assumed SELECT-oriented)
