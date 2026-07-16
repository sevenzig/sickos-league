-- UUID Migration Verification
-- This migration verifies that the UUID conversion was successful

-- Function to verify UUID migration integrity
CREATE OR REPLACE FUNCTION verify_uuid_migration()
RETURNS TABLE (
    check_name TEXT,
    status TEXT,
    details TEXT
) AS $$
BEGIN
    -- Check 1: Verify all teams have UUIDs
    RETURN QUERY
    SELECT
        'Teams UUID Population' as check_name,
        CASE WHEN COUNT(*) = COUNT(uuid_id) THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('%s/%s teams have UUIDs', COUNT(uuid_id), COUNT(*)) as details
    FROM teams;

    -- Check 2: Verify lineup UUID mappings
    RETURN QUERY
    SELECT
        'Lineup UUID Mappings' as check_name,
        CASE WHEN COUNT(*) = COUNT(team_uuid_id) THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('%s/%s lineups have UUID team references', COUNT(team_uuid_id), COUNT(*)) as details
    FROM lineups;

    -- Check 3: Verify matchup UUID mappings
    RETURN QUERY
    SELECT
        'Matchup UUID Mappings' as check_name,
        CASE WHEN COUNT(*) = COUNT(team1_uuid_id) AND COUNT(*) = COUNT(team2_uuid_id) THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('%s/%s matchups have UUID team references', LEAST(COUNT(team1_uuid_id), COUNT(team2_uuid_id)), COUNT(*)) as details
    FROM matchups;

    -- Check 4: Verify active_qbs conversion
    RETURN QUERY
    SELECT
        'Active QBs UUID Conversion' as check_name,
        CASE WHEN COUNT(CASE WHEN active_qbs IS NOT NULL THEN 1 END) = COUNT(CASE WHEN active_qbs_uuid IS NOT NULL THEN 1 END) THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('%s lineups with active_qbs converted to UUID format', COUNT(CASE WHEN active_qbs_uuid IS NOT NULL THEN 1 END)) as details
    FROM lineups
    WHERE active_qbs IS NOT NULL;

    -- Check 5: Verify foreign key constraints work
    BEGIN
        -- Try to insert a test league team with invalid UUID (should fail)
        INSERT INTO league_teams (league_id, slot_id, team_id)
        VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid());

        -- If we get here, the constraint didn't work
        RETURN QUERY
        SELECT
            'Foreign Key Constraints' as check_name,
            'FAIL' as status,
            'Foreign key constraint not enforced' as details;
    EXCEPTION WHEN foreign_key_violation THEN
        -- This is expected - foreign key constraint is working
        RETURN QUERY
        SELECT
            'Foreign Key Constraints' as check_name,
            'PASS' as status,
            'Foreign key constraints properly enforced' as details;
    END;

    -- Check 6: Verify views work
    RETURN QUERY
    SELECT
        'Multi-League Views' as check_name,
        CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('Views executing without errors') as details
    FROM v_league_teams
    LIMIT 1;

END;
$$ LANGUAGE plpgsql;

-- Run the verification
SELECT * FROM verify_uuid_migration();

-- Create a test function for multi-league operations
CREATE OR REPLACE FUNCTION test_multi_league_basic_ops()
RETURNS TABLE (
    operation TEXT,
    status TEXT,
    result TEXT
) AS $$
DECLARE
    test_league_id UUID;
    test_user_id UUID;
    team_count INTEGER;
BEGIN
    -- Get a test user (create one if needed)
    SELECT id INTO test_user_id FROM auth.users LIMIT 1;

    IF test_user_id IS NULL THEN
        RETURN QUERY
        SELECT
            'User Check' as operation,
            'SKIP' as status,
            'No users found - cannot test league creation' as result;
        RETURN;
    END IF;

    -- Test 1: Create league
    BEGIN
        SELECT create_league('UUID Test League', 2025, 1) INTO test_league_id;
        RETURN QUERY
        SELECT
            'Create League' as operation,
            'PASS' as status,
            FORMAT('League created with ID: %s', test_league_id) as result;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY
        SELECT
            'Create League' as operation,
            'FAIL' as status,
            FORMAT('Error: %s', SQLERRM) as result;
        RETURN;
    END;

    -- Test 2: Check team mapping capability
    SELECT COUNT(*) INTO team_count FROM teams WHERE uuid_id IS NOT NULL;

    RETURN QUERY
    SELECT
        'Team Mapping Ready' as operation,
        CASE WHEN team_count > 0 THEN 'PASS' ELSE 'FAIL' END as status,
        FORMAT('%s teams available for mapping', team_count) as result;

    -- Test 3: Get league details
    BEGIN
        PERFORM get_league_details(test_league_id);
        RETURN QUERY
        SELECT
            'Get League Details' as operation,
            'PASS' as status,
            'League details retrieved successfully' as result;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY
        SELECT
            'Get League Details' as operation,
            'FAIL' as status,
            FORMAT('Error: %s', SQLERRM) as result;
    END;

    -- Cleanup test league
    DELETE FROM leagues WHERE id = test_league_id;

END;
$$ LANGUAGE plpgsql;

-- Run basic operations test
SELECT * FROM test_multi_league_basic_ops();

-- Clean up test functions
DROP FUNCTION verify_uuid_migration();
DROP FUNCTION test_multi_league_basic_ops();