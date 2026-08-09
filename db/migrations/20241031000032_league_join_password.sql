-- League join password: shared secret gate into persistent membership.

ALTER TABLE leagues
    ADD COLUMN IF NOT EXISTS join_password_hash TEXT;

COMMENT ON COLUMN leagues.join_password_hash IS
    'bcrypt hash of shared join password; NULL means password-join disabled';

-- Membership + fantasy team creation after Express verifies the join password.
-- Not on the client RPC allowlist — only called via runAsUser from the API.
CREATE OR REPLACE FUNCTION join_league(
    p_league_id UUID,
    p_team_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_draft_status TEXT;
    v_has_password BOOLEAN;
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
        l.draft_status,
        (l.join_password_hash IS NOT NULL)
    INTO v_draft_status, v_has_password
    FROM leagues l
    WHERE l.id = p_league_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF NOT v_has_password THEN
        RAISE EXCEPTION 'This league does not accept password joins';
    END IF;

    IF v_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'This league''s draft has started; new members can no longer join';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id AND user_id = v_user_id
    ) INTO v_existing_member;

    IF v_existing_member THEN
        RAISE EXCEPTION 'You are already a member of this league';
    END IF;

    SELECT COUNT(*)::integer INTO v_team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF v_team_count >= 8 THEN
        RAISE EXCEPTION 'This league is full (8 teams)';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM fantasy_teams
        WHERE league_id = p_league_id AND LOWER(team_name) = LOWER(v_team_name)
    ) INTO v_team_name_exists;

    IF v_team_name_exists THEN
        RAISE EXCEPTION 'Team name "%" already exists in this league', v_team_name;
    END IF;

    INSERT INTO league_members (league_id, user_id, role)
    VALUES (p_league_id, v_user_id, 'member');

    INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
    VALUES (p_league_id, v_team_name, v_user_id)
    RETURNING id INTO v_fantasy_team_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        v_user_id,
        'JOIN',
        'league',
        p_league_id,
        jsonb_build_object(
            'join_method', 'password',
            'team_name', v_team_name,
            'fantasy_team_id', v_fantasy_team_id
        )
    );

    RETURN p_league_id;
END;
$$;

GRANT EXECUTE ON FUNCTION join_league(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION join_league IS
    'Add authenticated user as member + fantasy team after server-side password check';
