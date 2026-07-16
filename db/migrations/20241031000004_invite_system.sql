-- Invite System Implementation
-- Creates tables and functions for league invitation system

-- Create league_invitations table
CREATE TABLE IF NOT EXISTS league_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    used_at TIMESTAMPTZ,
    used_by_user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS league_invitations_code_idx ON league_invitations(code);
CREATE INDEX IF NOT EXISTS league_invitations_league_id_idx ON league_invitations(league_id);
CREATE INDEX IF NOT EXISTS league_invitations_expires_at_idx ON league_invitations(expires_at);

-- Row Level Security
ALTER TABLE league_invitations ENABLE ROW LEVEL SECURITY;

-- League members can view invitations for their leagues
CREATE POLICY "League members can view league invitations" ON league_invitations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM league_members lm
            WHERE lm.league_id = league_invitations.league_id
            AND lm.user_id = auth.uid()
        )
    );

-- League owners can create invitations
CREATE POLICY "League owners can create invitations" ON league_invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM league_members lm
            WHERE lm.league_id = league_invitations.league_id
            AND lm.user_id = auth.uid()
            AND lm.role = 'owner'
        )
    );

-- Anyone can view active invitations (for validation)
CREATE POLICY "Anyone can view active invitations for validation" ON league_invitations
    FOR SELECT USING (is_active = true AND expires_at > NOW());

-- Function to redeem an invite code
CREATE OR REPLACE FUNCTION redeem_invite_code(
    p_invite_code TEXT,
    p_team_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invitation_id UUID;
    v_league_id UUID;
    v_league_name TEXT;
    v_user_id UUID;
    v_existing_member BOOLEAN;
    v_team_name_exists BOOLEAN;
    v_fantasy_team_id UUID;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Validate and get invitation details
    SELECT
        li.id,
        li.league_id,
        l.name
    INTO v_invitation_id, v_league_id, v_league_name
    FROM league_invitations li
    JOIN leagues l ON li.league_id = l.id
    WHERE li.code = UPPER(p_invite_code)
      AND li.is_active = true
      AND li.expires_at > NOW()
      AND li.used_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid, expired, or already used invite code';
    END IF;

    -- Check if user is already a member of this league
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = v_league_id AND user_id = v_user_id
    ) INTO v_existing_member;

    IF v_existing_member THEN
        RAISE EXCEPTION 'You are already a member of this league';
    END IF;

    -- Check if team name already exists in this league
    SELECT EXISTS(
        SELECT 1 FROM fantasy_teams
        WHERE league_id = v_league_id AND LOWER(team_name) = LOWER(p_team_name)
    ) INTO v_team_name_exists;

    IF v_team_name_exists THEN
        RAISE EXCEPTION 'Team name "%" already exists in this league', p_team_name;
    END IF;

    -- Mark invitation as used
    UPDATE league_invitations
    SET
        used_at = NOW(),
        used_by_user_id = v_user_id,
        is_active = false
    WHERE id = v_invitation_id;

    -- Add user as league member
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (v_league_id, v_user_id, 'member');

    -- Create fantasy team for the user
    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (v_league_id, p_team_name, v_user_id)
    RETURNING id INTO v_fantasy_team_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        v_league_id,
        v_user_id,
        'JOIN',
        'league',
        v_league_id,
        jsonb_build_object(
            'invite_code', p_invite_code,
            'team_name', p_team_name,
            'fantasy_team_id', v_fantasy_team_id
        )
    );

    RETURN v_league_id;
END;
$$;

-- Function to clean up expired invitations (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Mark expired invitations as inactive
    UPDATE league_invitations
    SET is_active = false
    WHERE is_active = true
      AND expires_at <= NOW()
      AND used_at IS NULL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$;

-- Grant permissions
GRANT ALL ON league_invitations TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_invite_code TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_invitations TO authenticated;

-- Add helpful comments
COMMENT ON TABLE league_invitations IS 'Invitation codes for joining leagues';
COMMENT ON COLUMN league_invitations.code IS '8-character invite code (uppercase)';
COMMENT ON COLUMN league_invitations.expires_at IS 'When the invitation expires';
COMMENT ON COLUMN league_invitations.is_active IS 'Whether the invitation can still be used';
COMMENT ON COLUMN league_invitations.used_at IS 'When the invitation was used';
COMMENT ON FUNCTION redeem_invite_code IS 'Redeem an invite code to join a league';
COMMENT ON FUNCTION cleanup_expired_invitations IS 'Clean up expired invitations (for maintenance)';