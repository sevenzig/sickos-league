-- Add owner user ID to league details for team slot ordering
-- This ensures the league owner is always placed in team slot 1

-- Update the v_user_leagues view to include owner_user_id
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
    (SELECT COUNT(*) FROM fantasy_teams ft WHERE ft.league_id = l.id) as fantasy_teams_count,
    -- Add owner user ID for team slot ordering
    (SELECT lm_owner.user_id FROM league_members lm_owner WHERE lm_owner.league_id = l.id AND lm_owner.role = 'owner' LIMIT 1) as owner_user_id
FROM leagues l
JOIN league_members lm ON l.id = lm.league_id
WHERE lm.user_id = auth.uid();

-- Update the get_league_details function to return owner_user_id
-- (must drop first: the return type changes, which CREATE OR REPLACE rejects)
DROP FUNCTION IF EXISTS get_league_details(UUID);

CREATE OR REPLACE FUNCTION get_league_details(league_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    season INTEGER,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    user_role TEXT,
    member_count BIGINT,
    fantasy_teams_count BIGINT,
    owner_user_id UUID  -- Add owner user ID field
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_league_details.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT * FROM v_user_leagues
    WHERE v_user_leagues.id = get_league_details.league_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_league_details TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_league_details IS 'Get league details including owner user ID for team slot ordering';