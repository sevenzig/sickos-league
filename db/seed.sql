-- Local development seed data
-- Applied automatically by `supabase db reset` / `supabase start`.

-- The 32 NFL teams (names must match NFL_TEAMS in src/types.ts).
-- clean_infrastructure assigns each a uuid_id via the column default.
INSERT INTO teams (name, rosters)
SELECT t.name, '{}'::TEXT[]
FROM (VALUES
    ('Arizona'), ('Atlanta'), ('Baltimore'), ('Buffalo'),
    ('Carolina'), ('Chicago'), ('Cincinnati'), ('Cleveland'),
    ('Dallas'), ('Denver'), ('Detroit'), ('Green Bay'),
    ('Houston'), ('Indianapolis'), ('Jacksonville'), ('Kansas City'),
    ('Las Vegas'), ('LA Chargers'), ('LA Rams'), ('Miami'),
    ('Minnesota'), ('New England'), ('New Orleans'), ('NY Giants'),
    ('NY Jets'), ('Philadelphia'), ('Pittsburgh'), ('San Francisco'),
    ('Seattle'), ('Tampa Bay'), ('Tennessee'), ('Washington')
) AS t(name)
ON CONFLICT (name) DO NOTHING;

-- Flag the canonical 32 as NFL teams (column added in 20241031000016; kept
-- here so fresh databases, where seeds run after migrations, get flagged too)
UPDATE teams SET is_nfl = TRUE WHERE is_nfl = FALSE AND name IN (
    'Arizona', 'Atlanta', 'Baltimore', 'Buffalo',
    'Carolina', 'Chicago', 'Cincinnati', 'Cleveland',
    'Dallas', 'Denver', 'Detroit', 'Green Bay',
    'Houston', 'Indianapolis', 'Jacksonville', 'Kansas City',
    'Las Vegas', 'LA Chargers', 'LA Rams', 'Miami',
    'Minnesota', 'New England', 'New Orleans', 'NY Giants',
    'NY Jets', 'Philadelphia', 'Pittsburgh', 'San Francisco',
    'Seattle', 'Tampa Bay', 'Tennessee', 'Washington'
);

-- Legacy single-league settings row (the legacy path expects exactly one)
INSERT INTO league_settings (current_week, locked_weeks, season)
SELECT 1, '{}', 2025
WHERE NOT EXISTS (SELECT 1 FROM league_settings);
