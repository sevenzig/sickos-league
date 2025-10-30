-- Lineup and Week Management RPCs Migration
-- Functions for managing lineups and week locks

-- Function to set week lock time
CREATE OR REPLACE FUNCTION set_week_lock(
    league_id UUID,
    week_number INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN DEFAULT FALSE
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
        WHERE league_id = set_week_lock.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can manage week locks';
    END IF;

    -- Update or insert week lock settings
    INSERT INTO weeks (league_id, week_number, locks_at, is_locked)
    VALUES (league_id, week_number, locks_at, is_locked)
    ON CONFLICT (league_id, week_number)
    DO UPDATE SET
        locks_at = EXCLUDED.locks_at,
        is_locked = EXCLUDED.is_locked;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        league_id,
        auth.uid(),
        'UPDATE',
        'week',
        NULL,
        jsonb_build_object(
            'week_number', week_number,
            'locks_at', locks_at,
            'is_locked', is_locked
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to lock/unlock a week
CREATE OR REPLACE FUNCTION toggle_week_lock(
    league_id UUID,
    week_number INTEGER,
    lock_state BOOLEAN
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
        WHERE league_id = toggle_week_lock.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can lock/unlock weeks';
    END IF;

    -- Update week lock status
    UPDATE weeks
    SET is_locked = lock_state
    WHERE league_id = toggle_week_lock.league_id
      AND week_number = toggle_week_lock.week_number;

    -- If we're locking, also lock all lineups for this week in this league
    IF lock_state THEN
        UPDATE lineups
        SET is_locked = TRUE
        WHERE week = week_number
          AND team_uuid_id IN (
              SELECT team_id FROM league_teams
              WHERE league_id = toggle_week_lock.league_id
          );
    END IF;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        league_id,
        auth.uid(),
        CASE WHEN lock_state THEN 'LOCK' ELSE 'UNLOCK' END,
        'week',
        NULL,
        jsonb_build_object('week_number', week_number)
    );

    RETURN TRUE;
END;
$$;

-- Function to set lineup (with league context and validation)
CREATE OR REPLACE FUNCTION set_lineup(
    league_id UUID,
    team_id UUID,
    week INTEGER,
    active_qbs UUID[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_authorized BOOLEAN;
    week_locked BOOLEAN;
    league_teams_started INTEGER;
    current_user_role TEXT;
    team_slot_number INTEGER;
BEGIN
    -- Check if user is authorized (team manager or league owner)
    SELECT
        (ts.manager_user_id = auth.uid() OR lm.role = 'owner'),
        lm.role,
        ts.slot_number
    INTO is_authorized, current_user_role, team_slot_number
    FROM team_slots ts
    JOIN league_teams lt ON ts.id = lt.slot_id
    JOIN league_members lm ON lm.league_id = ts.league_id AND lm.user_id = auth.uid()
    WHERE lt.league_id = set_lineup.league_id
      AND lt.team_id = set_lineup.team_id;

    IF NOT is_authorized THEN
        RAISE EXCEPTION 'Not authorized to set lineup for this team';
    END IF;

    -- Check if week is locked
    SELECT COALESCE(is_locked, FALSE) INTO week_locked
    FROM weeks
    WHERE league_id = set_lineup.league_id
      AND week_number = set_lineup.week;

    -- Only allow lineup changes if week is not locked (unless owner override)
    IF week_locked AND current_user_role != 'owner' THEN
        RAISE EXCEPTION 'Cannot modify lineup: Week % is locked', week;
    END IF;

    -- Get league settings for teams started per week
    SELECT teams_started_per_week INTO league_teams_started
    FROM leagues
    WHERE id = set_lineup.league_id;

    -- Validate number of QBs
    IF array_length(active_qbs, 1) != league_teams_started THEN
        RAISE EXCEPTION 'Must start exactly % QBs for this league', league_teams_started;
    END IF;

    -- Validate that all QBs exist and are valid
    IF EXISTS(
        SELECT 1 FROM unnest(active_qbs) qb_id
        WHERE NOT EXISTS(SELECT 1 FROM teams WHERE uuid_id = qb_id)
    ) THEN
        RAISE EXCEPTION 'Invalid QB team ID provided';
    END IF;

    -- Upsert lineup using UUID columns
    INSERT INTO lineups (team_uuid_id, week, active_qbs_uuid, is_locked)
    VALUES (team_id, week, active_qbs, week_locked)
    ON CONFLICT (team_uuid_id, week)
    DO UPDATE SET
        active_qbs_uuid = EXCLUDED.active_qbs_uuid,
        is_locked = week_locked;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        league_id,
        auth.uid(),
        'SET',
        'lineup',
        NULL,
        jsonb_build_object(
            'team_id', team_id,
            'week', week,
            'active_qbs', active_qbs,
            'slot_number', team_slot_number,
            'is_owner_override', current_user_role = 'owner' AND week_locked
        )
    );

    RETURN TRUE;
END;
$$;

-- Function for owner override of lineup
CREATE OR REPLACE FUNCTION owner_override_lineup(
    league_id UUID,
    team_id UUID,
    week INTEGER,
    active_qbs UUID[],
    reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    league_teams_started INTEGER;
    team_slot_number INTEGER;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members
        WHERE league_id = owner_override_lineup.league_id
          AND user_id = auth.uid()
          AND role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can override lineups';
    END IF;

    -- Get league settings and team slot
    SELECT l.teams_started_per_week, ts.slot_number
    INTO league_teams_started, team_slot_number
    FROM leagues l
    JOIN league_teams lt ON l.id = lt.league_id
    JOIN team_slots ts ON lt.slot_id = ts.id
    WHERE l.id = owner_override_lineup.league_id
      AND lt.team_id = owner_override_lineup.team_id;

    -- Validate number of QBs
    IF array_length(active_qbs, 1) != league_teams_started THEN
        RAISE EXCEPTION 'Must start exactly % QBs for this league', league_teams_started;
    END IF;

    -- Validate that all QBs exist
    IF EXISTS(
        SELECT 1 FROM unnest(active_qbs) qb_id
        WHERE NOT EXISTS(SELECT 1 FROM teams WHERE uuid_id = qb_id)
    ) THEN
        RAISE EXCEPTION 'Invalid QB team ID provided';
    END IF;

    -- Upsert lineup using UUID columns (force unlock if needed for override)
    INSERT INTO lineups (team_uuid_id, week, active_qbs_uuid, is_locked)
    VALUES (team_id, week, active_qbs, TRUE)
    ON CONFLICT (team_uuid_id, week)
    DO UPDATE SET
        active_qbs_uuid = EXCLUDED.active_qbs_uuid,
        is_locked = TRUE;

    -- Log the override action with reason
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        league_id,
        auth.uid(),
        'OVERRIDE',
        'lineup',
        NULL,
        jsonb_build_object(
            'team_id', team_id,
            'week', week,
            'active_qbs', active_qbs,
            'slot_number', team_slot_number,
            'reason', reason
        )
    );

    RETURN TRUE;
END;
$$;

-- Function to get league lineups for a specific week
CREATE OR REPLACE FUNCTION get_league_lineups(
    league_id UUID,
    week_number INTEGER
)
RETURNS TABLE (
    team_id UUID,
    team_name TEXT,
    slot_number INTEGER,
    manager_user_id UUID,
    manager_email TEXT,
    active_qbs UUID[],
    qb_names TEXT[],
    is_locked BOOLEAN,
    week_locked BOOLEAN
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
    WHERE lm.league_id = get_league_lineups.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        vll.team_id,
        vll.team_name,
        vll.slot_number,
        vll.manager_user_id,
        u.email,
        COALESCE(vll.active_qbs, ARRAY[]::UUID[]),
        COALESCE(
            ARRAY(
                SELECT t.name
                FROM unnest(vll.active_qbs) WITH ORDINALITY AS qb_id(id, ord)
                JOIN teams t ON t.id = qb_id.id
                ORDER BY qb_id.ord
            ),
            ARRAY[]::TEXT[]
        ),
        COALESCE(vll.lineup_locked, FALSE),
        COALESCE(vll.week_locked, FALSE)
    FROM v_league_lineups vll
    LEFT JOIN auth.users u ON vll.manager_user_id = u.id
    WHERE vll.league_id = get_league_lineups.league_id
      AND vll.week = week_number
    ORDER BY vll.slot_number;
END;
$$;

-- Function to get week lock status
CREATE OR REPLACE FUNCTION get_week_status(
    league_id UUID,
    week_number INTEGER
)
RETURNS TABLE (
    week INTEGER,
    locks_at TIMESTAMPTZ,
    is_locked BOOLEAN,
    lineups_submitted INTEGER,
    total_teams INTEGER
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
    WHERE lm.league_id = get_week_status.league_id
      AND lm.user_id = auth.uid();

    IF user_role IS NULL THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        w.week_number,
        w.locks_at,
        COALESCE(w.is_locked, FALSE),
        (
            SELECT COUNT(*)::INTEGER
            FROM lineups l
            JOIN league_teams lt ON l.team_uuid_id = lt.team_id
            WHERE lt.league_id = get_week_status.league_id
              AND l.week = week_number
              AND l.active_qbs_uuid IS NOT NULL
              AND array_length(l.active_qbs_uuid, 1) > 0
        ),
        (
            SELECT COUNT(*)::INTEGER
            FROM league_teams lt
            JOIN team_slots ts ON lt.slot_id = ts.id
            WHERE lt.league_id = get_week_status.league_id
              AND ts.manager_user_id IS NOT NULL
        )
    FROM weeks w
    WHERE w.league_id = get_week_status.league_id
      AND w.week_number = get_week_status.week_number;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION set_week_lock TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_week_lock TO authenticated;
GRANT EXECUTE ON FUNCTION set_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION owner_override_lineup TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_lineups TO authenticated;
GRANT EXECUTE ON FUNCTION get_week_status TO authenticated;