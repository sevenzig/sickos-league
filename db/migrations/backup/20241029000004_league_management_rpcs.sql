-- League Management RPCs Migration
-- Core functions for league creation and management

-- Function to create a new league
CREATE OR REPLACE FUNCTION create_league(
    league_name TEXT,
    season INTEGER DEFAULT 2025,
    teams_started_per_week INTEGER DEFAULT 1
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_league_id UUID;
    slot_num INTEGER;
BEGIN
    -- Validate input
    IF league_name IS NULL OR LENGTH(TRIM(league_name)) = 0 THEN
        RAISE EXCEPTION 'League name cannot be empty';
    END IF;

    IF teams_started_per_week < 1 OR teams_started_per_week > 4 THEN
        RAISE EXCEPTION 'teams_started_per_week must be between 1 and 4';
    END IF;

    -- Create the league
    INSERT INTO leagues (name, season, teams_started_per_week, created_by)
    VALUES (league_name, season, teams_started_per_week, auth.uid())
    RETURNING id INTO new_league_id;

    -- Add creator as owner
    INSERT INTO league_members (league_id, user_id, role)
    VALUES (new_league_id, auth.uid(), 'owner');

    -- Create 8 team slots
    FOR slot_num IN 1..8 LOOP
        INSERT INTO team_slots (league_id, slot_number)
        VALUES (new_league_id, slot_num);
    END LOOP;

    -- Create weeks 1-18 (full season)
    FOR week_num IN 1..18 LOOP
        INSERT INTO weeks (league_id, week_number)
        VALUES (new_league_id, week_num);
    END LOOP;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        new_league_id,
        auth.uid(),
        'CREATE',
        'league',
        new_league_id,
        jsonb_build_object(
            'name', league_name,
            'season', season,
            'teams_started_per_week', teams_started_per_week
        )
    );

    RETURN new_league_id;
END;
$$;

-- Function to set draft time
CREATE OR REPLACE FUNCTION set_draft_time(
    league_id UUID,
    draft_time TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = set_draft_time.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can set draft time';
    END IF;

    -- Update draft time
    UPDATE leagues
    SET draft_at = draft_time
    WHERE id = league_id;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        league_id,
        auth.uid(),
        'UPDATE',
        'league',
        league_id,
        jsonb_build_object('draft_at', draft_time)
    );

    RETURN TRUE;
END;
$$;

-- Function to get user's leagues
CREATE OR REPLACE FUNCTION get_user_leagues()
RETURNS TABLE (
    league_id UUID,
    league_name TEXT,
    season INTEGER,
    role TEXT,
    teams_started_per_week INTEGER,
    draft_at TIMESTAMPTZ,
    member_count BIGINT,
    slots_filled BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.name,
        l.season,
        lm.role,
        l.teams_started_per_week,
        l.draft_at,
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count,
        (SELECT COUNT(*) FROM team_slots WHERE league_id = l.id AND manager_user_id IS NOT NULL) as slots_filled
    FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id
    WHERE lm.user_id = auth.uid()
    ORDER BY l.created_at DESC;
END;
$$;

-- Function to get league details
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
    slots_filled BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_league_details.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        l.id,
        l.name,
        l.season,
        l.teams_started_per_week,
        l.draft_at,
        l.created_at,
        user_role,
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count,
        (SELECT COUNT(*) FROM team_slots WHERE league_id = l.id AND manager_user_id IS NOT NULL) as slots_filled
    FROM leagues l
    WHERE l.id = get_league_details.league_id;
END;
$$;

-- Function to get league team slots
CREATE OR REPLACE FUNCTION get_league_slots(league_id UUID)
RETURNS TABLE (
    slot_id UUID,
    slot_number INTEGER,
    team_name TEXT,
    manager_user_id UUID,
    manager_email TEXT,
    has_active_invite BOOLEAN,
    invite_code TEXT,
    invite_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Check if user is a member of this league
    SELECT lm.role INTO user_role
    FROM league_members lm
    WHERE lm.league_id = get_league_slots.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        ts.id,
        ts.slot_number,
        ts.team_name,
        ts.manager_user_id,
        u.email,
        CASE WHEN i.id IS NOT NULL THEN TRUE ELSE FALSE END as has_active_invite,
        CASE WHEN user_role = 'owner' THEN i.code ELSE NULL END as invite_code,
        i.expires_at
    FROM team_slots ts
    LEFT JOIN auth.users u ON ts.manager_user_id = u.id
    LEFT JOIN invitations i ON ts.id = i.slot_id
        AND i.status = 'pending'
        AND i.expires_at > NOW()
    WHERE ts.league_id = get_league_slots.league_id
    ORDER BY ts.slot_number;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_league TO authenticated;
GRANT EXECUTE ON FUNCTION set_draft_time TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_leagues TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_details TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_slots TO authenticated;