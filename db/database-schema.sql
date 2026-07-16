-- Bad QB League Database Schema
-- Run this SQL in your Supabase SQL editor

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  rosters TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game stats table (from CSV imports)
CREATE TABLE IF NOT EXISTS game_stats (
  id SERIAL PRIMARY KEY,
  team_abbr VARCHAR(50) NOT NULL,
  week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  opponent VARCHAR(50),
  pass_completions INTEGER DEFAULT 0,
  pass_attempts INTEGER DEFAULT 0,
  pass_yards INTEGER DEFAULT 0,
  pass_tds INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  sacks INTEGER DEFAULT 0,
  sack_yards INTEGER DEFAULT 0,
  qbr DECIMAL(5,2) DEFAULT 0,
  rush_yards INTEGER DEFAULT 0,
  rush_tds INTEGER DEFAULT 0,
  longest_play INTEGER DEFAULT 0,
  fumbles INTEGER DEFAULT 0,
  fumbles_lost INTEGER DEFAULT 0,
  defensive_td INTEGER DEFAULT 0,
  safety INTEGER DEFAULT 0,
  game_ending_fumble INTEGER DEFAULT 0,
  game_winning_drive INTEGER DEFAULT 0,
  benching INTEGER DEFAULT 0,
  completion_percent DECIMAL(5,2) DEFAULT 0,
  net_pass_yards INTEGER DEFAULT 0,
  total_tds INTEGER DEFAULT 0,
  final_score INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_abbr, week, season)
);

-- Lineups table
CREATE TABLE IF NOT EXISTS lineups (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  active_qbs TEXT[] NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, week)
);

-- Matchups table
CREATE TABLE IF NOT EXISTS matchups (
  id SERIAL PRIMARY KEY,
  week INTEGER NOT NULL,
  team1_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team2_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  team1_score INTEGER DEFAULT 0,
  team2_score INTEGER DEFAULT 0,
  winner_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(week, team1_id, team2_id)
);

-- League settings table
CREATE TABLE IF NOT EXISTS league_settings (
  id SERIAL PRIMARY KEY,
  current_week INTEGER NOT NULL DEFAULT 1,
  locked_weeks INTEGER[] DEFAULT '{}',
  season INTEGER NOT NULL DEFAULT 2025,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_game_stats_week ON game_stats(week);
CREATE INDEX IF NOT EXISTS idx_game_stats_team ON game_stats(team_abbr);
CREATE INDEX IF NOT EXISTS idx_lineups_week ON lineups(week);
CREATE INDEX IF NOT EXISTS idx_lineups_team ON lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(week);
CREATE INDEX IF NOT EXISTS idx_matchups_teams ON matchups(team1_id, team2_id);

-- Enable Row Level Security (RLS)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for your security requirements)
CREATE POLICY "Allow public read access" ON teams FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON game_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON lineups FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON matchups FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON league_settings FOR SELECT USING (true);

CREATE POLICY "Allow public insert access" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert access" ON game_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert access" ON lineups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert access" ON matchups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public insert access" ON league_settings FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON teams FOR UPDATE USING (true);
CREATE POLICY "Allow public update access" ON game_stats FOR UPDATE USING (true);
CREATE POLICY "Allow public update access" ON lineups FOR UPDATE USING (true);
CREATE POLICY "Allow public update access" ON matchups FOR UPDATE USING (true);
CREATE POLICY "Allow public update access" ON league_settings FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access" ON teams FOR DELETE USING (true);
CREATE POLICY "Allow public delete access" ON game_stats FOR DELETE USING (true);
CREATE POLICY "Allow public delete access" ON lineups FOR DELETE USING (true);
CREATE POLICY "Allow public delete access" ON matchups FOR DELETE USING (true);
CREATE POLICY "Allow public delete access" ON league_settings FOR DELETE USING (true);
