-- Phase 6.2: archive legacy single-league tables as read-only;
-- lock down teams / game_stats writes to platform-admin only.

-- Legacy-only tables: SELECT for everyone (archive UI); no writes
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['lineups', 'matchups', 'league_settings'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow public insert access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public update access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public delete access" ON %I', t);
        -- Keep existing SELECT policy ("Allow public read access")
    END LOOP;
END $$;

-- teams + game_stats: public read; platform-admin write only
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['teams', 'game_stats'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow public insert access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public update access" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Allow public delete access" ON %I', t);

        EXECUTE format(
            'CREATE POLICY "Platform admin insert" ON %I FOR INSERT WITH CHECK (auth.is_platform_admin())',
            t
        );
        EXECUTE format(
            'CREATE POLICY "Platform admin update" ON %I FOR UPDATE USING (auth.is_platform_admin())',
            t
        );
        EXECUTE format(
            'CREATE POLICY "Platform admin delete" ON %I FOR DELETE USING (auth.is_platform_admin())',
            t
        );
    END LOOP;
END $$;
