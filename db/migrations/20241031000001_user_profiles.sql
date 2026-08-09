-- User Profiles System Migration
-- Creates user profiles table and storage bucket for profile photos

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    profile_photo_url TEXT, -- URL to profile photo served by the API
    email_preferences JSONB DEFAULT '{"marketing": false, "league_updates": true, "matchup_reminders": true, "weekly_summaries": false}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger for user_profiles
CREATE TRIGGER user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS user_profiles_created_at_idx ON user_profiles(created_at);

-- Grant permissions
GRANT ALL ON user_profiles TO authenticated;

-- Row Level Security policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own profile
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can view basic profile info of league members (for team names, etc.)
CREATE POLICY "League members can view basic profile info" ON user_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM league_members lm1
            JOIN league_members lm2 ON lm1.league_id = lm2.league_id
            WHERE lm1.user_id = auth.uid() AND lm2.user_id = user_profiles.user_id
        )
    );

-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'profile-photos',
    'profile-photos',
    true,
    1048576, -- 1MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for profile photos
CREATE POLICY "Anyone can view profile photos" ON storage.objects
    FOR SELECT USING (bucket_id = 'profile-photos');

CREATE POLICY "Users can upload their own profile photos" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'profile-photos' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can update their own profile photos" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'profile-photos' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their own profile photos" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'profile-photos' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Helper function to get user profile with fantasy team names
CREATE OR REPLACE FUNCTION get_user_profile_with_teams(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
    user_id UUID,
    email TEXT,
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
        up.user_id,
        au.email,
        up.first_name,
        up.last_name,
        up.profile_photo_url,
        up.email_preferences,
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
        up.created_at,
        up.updated_at
    FROM user_profiles up
    JOIN auth.users au ON up.user_id = au.id
    WHERE up.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_profile_with_teams TO authenticated;

-- Function to update user profile
CREATE OR REPLACE FUNCTION update_user_profile(
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_profile_photo_url TEXT DEFAULT NULL,
    p_email_preferences JSONB DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Create profile if it doesn't exist
    INSERT INTO user_profiles (user_id, first_name, last_name, profile_photo_url, email_preferences)
    VALUES (
        auth.uid(),
        p_first_name,
        p_last_name,
        p_profile_photo_url,
        p_email_preferences
    )
    ON CONFLICT (user_id) DO UPDATE SET
        first_name = COALESCE(p_first_name, user_profiles.first_name),
        last_name = COALESCE(p_last_name, user_profiles.last_name),
        profile_photo_url = COALESCE(p_profile_photo_url, user_profiles.profile_photo_url),
        email_preferences = COALESCE(p_email_preferences, user_profiles.email_preferences),
        updated_at = NOW();

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_user_profile TO authenticated;

-- Function to update fantasy team name
CREATE OR REPLACE FUNCTION update_fantasy_team_name(
    p_team_id UUID,
    p_team_name TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Verify user owns this team
    IF NOT EXISTS (
        SELECT 1 FROM fantasy_teams
        WHERE id = p_team_id AND manager_user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized to update this team';
    END IF;

    UPDATE fantasy_teams
    SET team_name = p_team_name
    WHERE id = p_team_id AND manager_user_id = auth.uid();

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_fantasy_team_name TO authenticated;

-- Add helpful comments
COMMENT ON TABLE user_profiles IS 'User profile information and preferences';
COMMENT ON COLUMN user_profiles.profile_photo_url IS 'URL to profile photo served by the API';
COMMENT ON COLUMN user_profiles.email_preferences IS 'JSON object with email notification preferences';
COMMENT ON FUNCTION get_user_profile_with_teams IS 'Get user profile with all fantasy team information';
COMMENT ON FUNCTION update_user_profile IS 'Update user profile information';
COMMENT ON FUNCTION update_fantasy_team_name IS 'Update fantasy team name (user must own the team)';