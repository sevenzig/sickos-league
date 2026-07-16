-- Fix two bugs surfaced by running the full migration chain on a fresh database:
--
-- 1. The league_members RLS policy selects from league_members inside its own
--    USING clause -> "infinite recursion detected in policy". Every other
--    policy that consults league_members hits it too.
--    Fix: a SECURITY DEFINER helper (owner bypasses RLS) + split policies.
--
-- 2. set_week_lock fails with 'column reference "league_id" is ambiguous':
--    its parameters share names with the weeks columns, and plpgsql parses the
--    ON CONFLICT target as expressions. Fix: #variable_conflict use_column.

-- Helper: membership check that bypasses RLS (function owner owns the table)
CREATE OR REPLACE FUNCTION is_league_member(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM league_members
        WHERE league_id = p_league_id
          AND user_id = auth.uid()
    );
$$;

GRANT EXECUTE ON FUNCTION is_league_member TO authenticated, anon;

-- Replace the self-referencing league_members policy
DROP POLICY IF EXISTS league_members_access ON league_members;

-- Users can always see/manage their own membership rows
CREATE POLICY league_members_own_rows ON league_members
    FOR ALL USING (user_id = auth.uid());

-- Members can see the other members of their leagues
CREATE POLICY league_members_same_league ON league_members
    FOR SELECT USING (is_league_member(league_id));

-- Recreate set_week_lock with the variable-conflict pragma
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
#variable_conflict use_column
DECLARE
    is_owner BOOLEAN;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = set_week_lock.league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can manage week locks';
    END IF;

    -- Update or insert week lock settings
    INSERT INTO weeks (league_id, week_number, locks_at, is_locked)
    VALUES (set_week_lock.league_id, set_week_lock.week_number, set_week_lock.locks_at, set_week_lock.is_locked)
    ON CONFLICT (league_id, week_number)
    DO UPDATE SET
        locks_at = EXCLUDED.locks_at,
        is_locked = EXCLUDED.is_locked;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        set_week_lock.league_id,
        auth.uid(),
        'UPDATE',
        'week',
        NULL,
        jsonb_build_object(
            'week_number', set_week_lock.week_number,
            'locks_at', set_week_lock.locks_at,
            'is_locked', set_week_lock.is_locked
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION set_week_lock TO authenticated;
