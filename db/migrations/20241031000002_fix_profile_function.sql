-- Fix user profile function type mismatch
-- The auth.users.email column is VARCHAR(255), not TEXT

-- Drop and recreate the function with correct return types
DROP FUNCTION IF EXISTS get_user_profile_with_teams(UUID);

CREATE OR REPLACE FUNCTION get_user_profile_with_teams(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    user_id UUID,
    email VARCHAR(255), -- Changed from TEXT to VARCHAR(255) to match auth.users.email
    first_name TEXT,
    last_name TEXT,
    profile_photo_url TEXT,
    email_preferences JSONB,
    fantasy_teams JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(up.user_id, p_user_id) as user_id,
        au.email,
        up.first_name,
        up.last_name,
        up.profile_photo_url,
        COALESCE(up.email_preferences, '{"marketing": false, "league_updates": true, "matchup_reminders": true, "weekly_summaries": false}'::jsonb) as email_preferences,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'league_id', ft.league_id,
                        'league_name', l.name,
                        'team_name', ft.team_name,
                        'team_id', ft.id
                    )
                )
                FROM fantasy_teams ft
                JOIN leagues l ON ft.league_id = l.id
                WHERE ft.manager_user_id = p_user_id
            ),
            '[]'::jsonb
        ) as fantasy_teams,
        COALESCE(up.created_at, NOW()) as created_at,
        COALESCE(up.updated_at, NOW()) as updated_at
    FROM auth.users au
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE au.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_profile_with_teams TO authenticated;

-- Add a comment explaining the fix
COMMENT ON FUNCTION get_user_profile_with_teams IS 'Get user profile with fantasy teams - fixed VARCHAR(255) type for email column';