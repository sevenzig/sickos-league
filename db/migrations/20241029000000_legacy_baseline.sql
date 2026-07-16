-- Legacy baseline schema
-- On the original hosted project these tables were created manually via
-- database-schema.sql in the repo root. This migration recreates them so a
-- fresh (local/self-contained) database can apply the rest of the migration
-- chain, which ALTERs and references `teams`.
-- Everything is IF NOT EXISTS so it is a no-op on databases that already
-- have the legacy schema.

-- Teams table (legacy: 8 fantasy teams; multi-league: the 32 NFL teams)
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  rosters TEXT[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game stats table (from CSV imports) - site-wide, league-agnostic
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

-- Legacy lineups table (single-league path)
CREATE TABLE IF NOT EXISTS lineups (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  active_qbs TEXT[] NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, week)
);

-- Legacy matchups table (single-league path)
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

-- Legacy league settings (single-league path)
CREATE TABLE IF NOT EXISTS league_settings (
  id SERIAL PRIMARY KEY,
  current_week INTEGER NOT NULL DEFAULT 1,
  locked_weeks INTEGER[] DEFAULT '{}',
  season INTEGER NOT NULL DEFAULT 2025,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_game_stats_week ON game_stats(week);
CREATE INDEX IF NOT EXISTS idx_game_stats_team ON game_stats(team_abbr);
CREATE INDEX IF NOT EXISTS idx_lineups_week ON lineups(week);
CREATE INDEX IF NOT EXISTS idx_lineups_team ON lineups(team_id);
CREATE INDEX IF NOT EXISTS idx_matchups_week ON matchups(week);
CREATE INDEX IF NOT EXISTS idx_matchups_teams ON matchups(team1_id, team2_id);

-- RLS (matches the policies applied to the hosted project)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;
ALTER TABLE matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['teams', 'game_stats', 'lineups', 'matchups', 'league_settings'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow public read access" ON %I FOR SELECT USING (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public insert access" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow public insert access" ON %I FOR INSERT WITH CHECK (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public update access" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow public update access" ON %I FOR UPDATE USING (true)', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public delete access" ON %I', t);
        EXECUTE format('CREATE POLICY "Allow public delete access" ON %I FOR DELETE USING (true)', t);
    END LOOP;
END $$;
