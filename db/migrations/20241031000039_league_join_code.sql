-- Multi-use join code per league. Replaces one-time league_invitations rows
-- and join_password_hash as the product join path. Old columns/tables stay.

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS join_code TEXT,
    ADD COLUMN IF NOT EXISTS join_code_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN leagues.join_code IS
    'Multi-use 8-char uppercase join code; NULL means joining is off';
COMMENT ON COLUMN leagues.join_code_expires_at IS
    'When the join code stops accepting new members; refreshed on generate/rotate';

CREATE UNIQUE INDEX IF NOT EXISTS leagues_join_code_unique
    ON leagues (join_code)
    WHERE join_code IS NOT NULL;

-- Redeem against leagues.join_code (multi-use). Does not touch league_invitations.
CREATE OR REPLACE FUNCTION redeem_invite_code(
    p_invite_code TEXT,
    p_team_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_league_id UUID;
    v_draft_status TEXT;
    v_expires_at TIMESTAMPTZ;
    v_user_id UUID;
    v_existing_member BOOLEAN;
    v_team_name_exists BOOLEAN;
    v_team_count INTEGER;
    v_fantasy_team_id UUID;
    v_team_name TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    v_team_name := trim(p_team_name);
    IF v_team_name IS NULL OR length(v_team_name) < 3 THEN
        RAISE EXCEPTION 'Team name must be at least 3 characters';
    END IF;
    IF length(v_team_name) > 50 THEN
        RAISE EXCEPTION 'Team name must be at most 50 characters';
    END IF;

    SELECT
        l.id,
        l.draft_status,
        l.join_code_expires_at
    INTO v_league_id, v_draft_status, v_expires_at
    FROM leagues l
    WHERE l.join_code = UPPER(trim(p_invite_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    IF v_expires_at IS NOT NULL AND v_expires_at <= NOW() THEN
        RAISE EXCEPTION 'Invalid or expired invite code';
    END IF;

    IF v_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'This league''s draft has started; new members can no longer join';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = v_league_id AND user_id = v_user_id
    ) INTO v_existing_member;

    -- Already a member: return the league (no second team).
    IF v_existing_member THEN
        RETURN v_league_id;
    END IF;

    SELECT COUNT(*)::integer INTO v_team_count
    FROM fantasy_teams
    WHERE league_id = v_league_id;

    IF v_team_count >= 8 THEN
        RAISE EXCEPTION 'This league is full (8 teams)';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM fantasy_teams
        WHERE league_id = v_league_id AND LOWER(team_name) = LOWER(v_team_name)
    ) INTO v_team_name_exists;

    IF v_team_name_exists THEN
        RAISE EXCEPTION 'Team name "%" already exists in this league', v_team_name;
    END IF;

    INSERT INTO league_members (league_id, user_id, role)
    VALUES (v_league_id, v_user_id, 'member');

    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (v_league_id, v_team_name, v_user_id)
    RETURNING id INTO v_fantasy_team_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        v_league_id,
        v_user_id,
        'JOIN',
        'league',
        v_league_id,
        jsonb_build_object(
            'join_method', 'join_code',
            'invite_code', UPPER(trim(p_invite_code)),
            'team_name', v_team_name,
            'fantasy_team_id', v_fantasy_team_id
        )
    );

    RETURN v_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_invite_code(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION redeem_invite_code IS
    'Join a league via multi-use leagues.join_code; does not burn the code';
