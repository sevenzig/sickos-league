-- Profile timezone preference for kickoff display (default America/New_York).
-- Display-only; server kickoff freeze still uses TIMESTAMPTZ / NOW().

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';

COMMENT ON COLUMN user_profiles.timezone IS
  'IANA timezone for displaying NFL kickoffs (default America/New_York)';

DROP FUNCTION IF EXISTS get_user_profile_with_teams(UUID);

CREATE OR REPLACE FUNCTION get_user_profile_with_teams(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    user_id UUID,
    email VARCHAR(255),
    first_name TEXT,
    last_name TEXT,
    profile_photo_url TEXT,
    email_preferences JSONB,
    timezone TEXT,
    fantasy_teams JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(up.user_id, p_user_id) AS user_id,
        au.email,
        up.first_name,
        up.last_name,
        up.profile_photo_url,
        COALESCE(
            up.email_preferences,
            '{"marketing": false, "league_updates": true, "matchup_reminders": true, "weekly_summaries": false}'::jsonb
        ) AS email_preferences,
        COALESCE(up.timezone, 'America/New_York') AS timezone,
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
        ) AS fantasy_teams,
        COALESCE(up.created_at, NOW()) AS created_at,
        COALESCE(up.updated_at, NOW()) AS updated_at
    FROM auth.users au
    LEFT JOIN user_profiles up ON au.id = up.user_id
    WHERE au.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_profile_with_teams TO authenticated;

COMMENT ON FUNCTION get_user_profile_with_teams IS
  'Get user profile with fantasy teams and timezone preference';

CREATE OR REPLACE FUNCTION update_user_profile(
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_profile_photo_url TEXT DEFAULT NULL,
    p_email_preferences JSONB DEFAULT NULL,
    p_timezone TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_timezone IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
    ) THEN
        RAISE EXCEPTION 'Invalid timezone: %', p_timezone;
    END IF;

    INSERT INTO user_profiles (
        user_id,
        first_name,
        last_name,
        profile_photo_url,
        email_preferences,
        timezone
    )
    VALUES (
        auth.uid(),
        p_first_name,
        p_last_name,
        p_profile_photo_url,
        p_email_preferences,
        COALESCE(p_timezone, 'America/New_York')
    )
    ON CONFLICT (user_id) DO UPDATE SET
        first_name = COALESCE(p_first_name, user_profiles.first_name),
        last_name = COALESCE(p_last_name, user_profiles.last_name),
        profile_photo_url = COALESCE(p_profile_photo_url, user_profiles.profile_photo_url),
        email_preferences = COALESCE(p_email_preferences, user_profiles.email_preferences),
        timezone = COALESCE(p_timezone, user_profiles.timezone),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_profile TO authenticated;

COMMENT ON FUNCTION update_user_profile IS
  'Update user profile including optional IANA timezone (validated against pg_timezone_names)';
