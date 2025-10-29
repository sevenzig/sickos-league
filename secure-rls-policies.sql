-- Secure RLS Policies for Bad QB League
-- Run this SQL in your Supabase SQL editor to replace the current permissive policies

-- First, drop all existing policies
DROP POLICY IF EXISTS "Allow public read access" ON teams;
DROP POLICY IF EXISTS "Allow public read access" ON game_stats;
DROP POLICY IF EXISTS "Allow public read access" ON lineups;
DROP POLICY IF EXISTS "Allow public read access" ON matchups;
DROP POLICY IF EXISTS "Allow public read access" ON league_settings;

DROP POLICY IF EXISTS "Allow public insert access" ON teams;
DROP POLICY IF EXISTS "Allow public insert access" ON game_stats;
DROP POLICY IF EXISTS "Allow public insert access" ON lineups;
DROP POLICY IF EXISTS "Allow public insert access" ON matchups;
DROP POLICY IF EXISTS "Allow public insert access" ON league_settings;

DROP POLICY IF EXISTS "Allow public update access" ON teams;
DROP POLICY IF EXISTS "Allow public update access" ON game_stats;
DROP POLICY IF EXISTS "Allow public update access" ON lineups;
DROP POLICY IF EXISTS "Allow public update access" ON matchups;
DROP POLICY IF EXISTS "Allow public update access" ON league_settings;

DROP POLICY IF EXISTS "Allow public delete access" ON teams;
DROP POLICY IF EXISTS "Allow public delete access" ON game_stats;
DROP POLICY IF EXISTS "Allow public delete access" ON lineups;
DROP POLICY IF EXISTS "Allow public delete access" ON matchups;
DROP POLICY IF EXISTS "Allow public delete access" ON league_settings;

-- =============================================================================
-- TEAMS TABLE POLICIES
-- =============================================================================
-- Anyone can view teams (public rosters page)
CREATE POLICY "teams_select_policy" ON teams
  FOR SELECT USING (true);

-- Only authenticated users can modify teams
CREATE POLICY "teams_insert_policy" ON teams
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "teams_update_policy" ON teams
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "teams_delete_policy" ON teams
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================================================
-- GAME_STATS TABLE POLICIES
-- =============================================================================
-- Anyone can view game stats (public scores/home page)
CREATE POLICY "game_stats_select_policy" ON game_stats
  FOR SELECT USING (true);

-- Only authenticated users can import/modify game stats
CREATE POLICY "game_stats_insert_policy" ON game_stats
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "game_stats_update_policy" ON game_stats
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "game_stats_delete_policy" ON game_stats
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================================================
-- LINEUPS TABLE POLICIES
-- =============================================================================
-- Anyone can view lineups (public lineups display)
CREATE POLICY "lineups_select_policy" ON lineups
  FOR SELECT USING (true);

-- Only authenticated users can modify lineups
CREATE POLICY "lineups_insert_policy" ON lineups
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "lineups_update_policy" ON lineups
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "lineups_delete_policy" ON lineups
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================================================
-- MATCHUPS TABLE POLICIES
-- =============================================================================
-- Anyone can view matchups (public home/scores page)
CREATE POLICY "matchups_select_policy" ON matchups
  FOR SELECT USING (true);

-- Only authenticated users can modify matchups
CREATE POLICY "matchups_insert_policy" ON matchups
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "matchups_update_policy" ON matchups
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "matchups_delete_policy" ON matchups
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================================================
-- LEAGUE_SETTINGS TABLE POLICIES
-- =============================================================================
-- Anyone can view league settings (current week, etc.)
CREATE POLICY "league_settings_select_policy" ON league_settings
  FOR SELECT USING (true);

-- Only authenticated users can modify league settings
CREATE POLICY "league_settings_insert_policy" ON league_settings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "league_settings_update_policy" ON league_settings
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "league_settings_delete_policy" ON league_settings
  FOR DELETE USING (auth.role() = 'authenticated');

-- =============================================================================
-- OPTIONAL: More Restrictive Policies (uncomment if needed)
-- =============================================================================

-- If you want to restrict viewing of certain data to authenticated users only:
--
-- DROP POLICY "lineups_select_policy" ON lineups;
-- CREATE POLICY "lineups_select_policy" ON lineups
--   FOR SELECT USING (true); -- Keep public for now, or change to auth.role() = 'authenticated'

-- If you want role-based access (requires setting up user roles):
--
-- CREATE POLICY "admin_only_delete" ON teams
--   FOR DELETE USING (auth.jwt() ->> 'role' = 'admin');