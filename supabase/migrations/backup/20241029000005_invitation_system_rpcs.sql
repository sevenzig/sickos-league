-- Invitation System RPCs Migration
-- Functions for managing league invitations

-- Function to create a slot invitation
CREATE OR REPLACE FUNCTION create_slot_invite(
    league_id UUID,
    slot_id UUID,
    expires_hours INTEGER DEFAULT 168 -- 7 days
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    slot_available BOOLEAN;
    invite_code TEXT;
    expires_at TIMESTAMPTZ;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = create_slot_invite.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can create invitations';
    END IF;

    -- Check if slot exists and is available
    SELECT manager_user_id IS NULL INTO slot_available
    FROM team_slots
    WHERE id = slot_id AND league_id = create_slot_invite.league_id;

    IF slot_available IS NULL THEN
        RAISE EXCEPTION 'Slot not found in this league';
    END IF;

    IF NOT slot_available THEN
        RAISE EXCEPTION 'Slot is already occupied';
    END IF;

    -- Revoke any existing pending invitations for this slot
    UPDATE invitations
    SET status = 'revoked'
    WHERE slot_id = create_slot_invite.slot_id
      AND status = 'pending';

    -- Calculate expiration time
    expires_at := NOW() + INTERVAL '1 hour' * expires_hours;

    -- Create new invitation
    INSERT INTO invitations (league_id, slot_id, expires_at)
    VALUES (create_slot_invite.league_id, slot_id, expires_at)
    RETURNING code INTO invite_code;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        create_slot_invite.league_id,
        auth.uid(),
        'CREATE',
        'invitation',
        NULL,
        jsonb_build_object(
            'slot_id', slot_id,
            'code', invite_code,
            'expires_at', expires_at
        )
    );

    RETURN invite_code;
END;
$$;

-- Function to revoke an invitation
CREATE OR REPLACE FUNCTION revoke_invite(invite_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    invitation_league_id UUID;
    is_owner BOOLEAN;
BEGIN
    -- Get league ID for this invitation
    SELECT league_id INTO invitation_league_id
    FROM invitations
    WHERE code = invite_code AND status = 'pending';

    IF invitation_league_id IS NULL THEN
        RAISE EXCEPTION 'Invitation not found or already processed';
    END IF;

    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = invitation_league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can revoke invitations';
    END IF;

    -- Revoke the invitation
    UPDATE invitations
    SET status = 'revoked'
    WHERE code = invite_code;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        invitation_league_id,
        auth.uid(),
        'REVOKE',
        'invitation',
        NULL,
        jsonb_build_object('code', invite_code)
    );

    RETURN TRUE;
END;
$$;

-- Function to get invitation details (public for redemption page)
CREATE OR REPLACE FUNCTION get_invitation_details(invite_code TEXT)
RETURNS TABLE (
    league_id UUID,
    league_name TEXT,
    slot_number INTEGER,
    team_name TEXT,
    expires_at TIMESTAMPTZ,
    is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.name,
        ts.slot_number,
        ts.team_name,
        i.expires_at,
        (i.status = 'pending' AND i.expires_at > NOW()) as is_valid
    FROM invitations i
    JOIN leagues l ON i.league_id = l.id
    JOIN team_slots ts ON i.slot_id = ts.id
    WHERE i.code = invite_code;
END;
$$;

-- Function to redeem an invitation
CREATE OR REPLACE FUNCTION redeem_invite(invite_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    invitation_record RECORD;
    redeemed_league_id UUID;
BEGIN
    -- Get invitation details
    SELECT i.*, l.name as league_name, ts.slot_number
    INTO invitation_record
    FROM invitations i
    JOIN leagues l ON i.league_id = l.id
    JOIN team_slots ts ON i.slot_id = ts.id
    WHERE i.code = invite_code
      AND i.status = 'pending'
      AND i.expires_at > NOW()
      AND ts.manager_user_id IS NULL;

    IF invitation_record IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired invitation code';
    END IF;

    -- Check if user is already a member of this league
    IF EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = invitation_record.league_id
          AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'User is already a member of this league';
    END IF;

    -- Assign user to the slot
    UPDATE team_slots
    SET manager_user_id = auth.uid()
    WHERE id = invitation_record.slot_id;

    -- Add user as league member
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (invitation_record.league_id, auth.uid(), 'manager');

    -- Mark invitation as redeemed
    UPDATE invitations
    SET status = 'redeemed',
        redeemed_by = auth.uid(),
        redeemed_at = NOW()
    WHERE code = invite_code;

    redeemed_league_id := invitation_record.league_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        redeemed_league_id,
        auth.uid(),
        'REDEEM',
        'invitation',
        NULL,
        jsonb_build_object(
            'code', invite_code,
            'slot_id', invitation_record.slot_id,
            'slot_number', invitation_record.slot_number
        )
    );

    RETURN redeemed_league_id;
END;
$$;

-- Function to update team name (managers can update their own slot)
CREATE OR REPLACE FUNCTION update_team_name(
    slot_id UUID,
    new_team_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    slot_league_id UUID;
    is_authorized BOOLEAN;
BEGIN
    -- Validate team name
    IF new_team_name IS NULL OR LENGTH(TRIM(new_team_name)) = 0 THEN
        RAISE EXCEPTION 'Team name cannot be empty';
    END IF;

    IF LENGTH(new_team_name) > 50 THEN
        RAISE EXCEPTION 'Team name cannot exceed 50 characters';
    END IF;

    -- Get league ID and check authorization
    SELECT
        ts.league_id,
        (ts.manager_user_id = auth.uid() OR
         EXISTS(SELECT 1 FROM league_members WHERE league_id = ts.league_id AND user_id = auth.uid() AND role = 'owner')
        ) INTO slot_league_id, is_authorized
    FROM team_slots ts
    WHERE ts.id = slot_id;

    IF slot_league_id IS NULL THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to update this team name';
    END IF;

    -- Update team name
    UPDATE team_slots
    SET team_name = new_team_name
    WHERE id = slot_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        slot_league_id,
        auth.uid(),
        'UPDATE',
        'team_slot',
        slot_id,
        jsonb_build_object('team_name', new_team_name)
    );

    RETURN TRUE;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_slot_invite TO authenticated;
GRANT EXECUTE ON FUNCTION revoke_invite TO authenticated;
GRANT EXECUTE ON FUNCTION get_invitation_details TO anon, authenticated;
GRANT EXECUTE ON FUNCTION redeem_invite TO authenticated;
GRANT EXECUTE ON FUNCTION update_team_name TO authenticated;