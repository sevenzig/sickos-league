-- Phase 5: League management polish.
--
-- 5.1 Commissioner toolkit RPCs, all audit-logged:
--       remove_league_member    (pre-draft only)
--       transfer_commissioner
--       delete_league
--     generate_league_schedule gains a pre-season gate (no regenerate once
--     any week is locked or any matchup has a recorded score).
-- 5.2 Team identity: fantasy_teams.logo_url, surfaced through
--     get_league_fantasy_teams and v_league_standings. The logo file itself
--     is stored by the API (same pattern as profile photos).

-- ============================================================
-- 5.2 Team logo column + surfacing
-- ============================================================

ALTER TABLE fantasy_teams ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMENT ON COLUMN fantasy_teams.logo_url IS 'Team logo/avatar path served by the API (e.g. /photos/teams/<id>/logo.png)';

-- Return type changes (logo_url appended), so drop first.
DROP FUNCTION IF EXISTS get_league_fantasy_teams(UUID);

CREATE FUNCTION get_league_fantasy_teams(p_league_id UUID)
RETURNS TABLE (
    id UUID,
    league_id UUID,
    team_name TEXT,
    manager_user_id UUID,
    manager_email TEXT,
    created_at TIMESTAMPTZ,
    logo_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ft.id,
        ft.league_id,
        ft.team_name,
        ft.manager_user_id,
        u.email::TEXT as manager_email,
        ft.created_at,
        ft.logo_url
    FROM fantasy_teams ft
    LEFT JOIN auth.users u ON ft.manager_user_id = u.id
    WHERE ft.league_id = p_league_id
    ORDER BY ft.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_fantasy_teams TO authenticated;

-- v_league_standings: logo_url appended (CREATE OR REPLACE VIEW allows
-- adding columns at the end). Body otherwise identical to 20241031000008.
CREATE OR REPLACE VIEW v_league_standings
WITH (security_invoker = true)
AS
WITH matchup_results AS (
    SELECT
        lm.league_id,
        lm.fantasy_team1_id AS fantasy_team_id,
        lm.team1_score AS points_for,
        lm.team2_score AS points_against
    FROM league_matchups lm
    WHERE lm.is_complete
      AND lm.team1_score IS NOT NULL
      AND lm.team2_score IS NOT NULL
    UNION ALL
    SELECT
        lm.league_id,
        lm.fantasy_team2_id,
        lm.team2_score,
        lm.team1_score
    FROM league_matchups lm
    WHERE lm.is_complete
      AND lm.team1_score IS NOT NULL
      AND lm.team2_score IS NOT NULL
),
team_records AS (
    SELECT
        ft.league_id,
        ft.id AS fantasy_team_id,
        ft.team_name,
        ft.manager_user_id,
        ft.logo_url,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for > mr.points_against)::INTEGER AS wins,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for < mr.points_against)::INTEGER AS losses,
        COUNT(mr.fantasy_team_id) FILTER (WHERE mr.points_for = mr.points_against)::INTEGER AS ties,
        COALESCE(SUM(mr.points_for), 0) AS points_for,
        COALESCE(SUM(mr.points_against), 0) AS points_against,
        COUNT(mr.fantasy_team_id)::INTEGER AS games_played
    FROM fantasy_teams ft
    LEFT JOIN matchup_results mr
        ON mr.league_id = ft.league_id
       AND mr.fantasy_team_id = ft.id
    GROUP BY ft.league_id, ft.id, ft.team_name, ft.manager_user_id, ft.logo_url
)
SELECT
    tr.league_id,
    tr.fantasy_team_id,
    tr.team_name,
    tr.manager_user_id,
    tr.wins,
    tr.losses,
    tr.ties,
    tr.points_for,
    tr.points_against,
    tr.games_played,
    CASE WHEN tr.games_played > 0
         THEN ROUND((tr.wins + 0.5 * tr.ties)::NUMERIC / tr.games_played, 3)
         ELSE 0 END AS win_percentage,
    ROW_NUMBER() OVER (
        PARTITION BY tr.league_id
        ORDER BY tr.wins DESC, tr.points_for DESC, tr.team_name
    ) AS rank,
    tr.logo_url
FROM team_records tr;

GRANT SELECT ON v_league_standings TO authenticated;

-- ============================================================
-- 5.1 remove_league_member: owner removes a member (and their fantasy team)
--     before the draft starts. Pre-draft only - after that, rosters and
--     picks reference the team and removal would corrupt the season.
-- ============================================================

CREATE OR REPLACE FUNCTION remove_league_member(
    p_league_id UUID,
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_draft_status TEXT;
    target_role TEXT;
    removed_team_id UUID;
    removed_team_name TEXT;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can remove members';
    END IF;

    SELECT l.draft_status INTO league_draft_status
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Members can only be removed before the draft starts';
    END IF;

    SELECT lm.role INTO target_role
    FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = p_user_id;

    IF target_role IS NULL THEN
        RAISE EXCEPTION 'User is not a member of this league';
    END IF;

    IF target_role = 'owner' THEN
        RAISE EXCEPTION 'The league owner cannot be removed (transfer the league first)';
    END IF;

    -- Their fantasy team goes with them (lineups/rosters cascade; no draft
    -- picks can exist because the draft has not started).
    DELETE FROM fantasy_teams
    WHERE league_id = p_league_id AND manager_user_id = p_user_id
    RETURNING id, team_name INTO removed_team_id, removed_team_name;

    DELETE FROM league_members
    WHERE league_id = p_league_id AND user_id = p_user_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'REMOVE_MEMBER',
        'league_member',
        p_user_id,
        jsonb_build_object(
            'removed_user_id', p_user_id,
            'fantasy_team_id', removed_team_id,
            'fantasy_team_name', removed_team_name
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_league_member TO authenticated;

COMMENT ON FUNCTION remove_league_member IS 'Owner removes a member and their fantasy team (pre-draft only)';

-- ============================================================
-- 5.1 transfer_commissioner: owner hands the league to another member.
-- ============================================================

CREATE OR REPLACE FUNCTION transfer_commissioner(
    p_league_id UUID,
    p_new_owner_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    target_is_member BOOLEAN;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_new_owner_user_id = current_user_id THEN
        RAISE EXCEPTION 'You are already the commissioner';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only the league owner can transfer the league';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = p_new_owner_user_id
    ) INTO target_is_member;

    IF NOT target_is_member THEN
        RAISE EXCEPTION 'The new commissioner must already be a league member';
    END IF;

    UPDATE league_members
    SET role = 'owner'
    WHERE league_id = p_league_id AND user_id = p_new_owner_user_id;

    UPDATE league_members
    SET role = 'member'
    WHERE league_id = p_league_id AND user_id = current_user_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'TRANSFER_OWNERSHIP',
        'league',
        p_league_id,
        jsonb_build_object('new_owner_user_id', p_new_owner_user_id)
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_commissioner TO authenticated;

COMMENT ON FUNCTION transfer_commissioner IS 'Owner transfers the commissioner role to another league member';

-- ============================================================
-- 5.1 delete_league: owner permanently deletes the league; everything
--     league-scoped cascades. The audit row is written with league_id NULL
--     (a league-scoped row would be cascaded away with the league) and the
--     deleted league identified in details.
-- ============================================================

CREATE OR REPLACE FUNCTION delete_league(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_name TEXT;
BEGIN
    current_user_id := auth.uid();

    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = current_user_id
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only the league owner can delete the league';
    END IF;

    SELECT l.name INTO league_name FROM leagues l WHERE l.id = p_league_id;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        NULL,
        current_user_id,
        'DELETE',
        'league',
        p_league_id,
        jsonb_build_object('league_id', p_league_id, 'league_name', league_name)
    );

    DELETE FROM leagues WHERE id = p_league_id;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_league TO authenticated;

COMMENT ON FUNCTION delete_league IS 'Owner permanently deletes a league and all league-scoped data (cascades)';

-- Actors can always see their own audit rows. Needed for the delete_league
-- row, whose league_id is NULL and therefore invisible to the league-member
-- policy. (Policies are OR'ed; there is still no INSERT/UPDATE policy, so
-- audit_logs stays append-only via SECURITY DEFINER functions.)
DROP POLICY IF EXISTS audit_logs_actor_access ON audit_logs;
CREATE POLICY audit_logs_actor_access ON audit_logs
    FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 5.1 Schedule regenerate gate: pre-season only. Identical to
--     20241031000014_async_snake_draft.sql plus the in-season guard.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
    league_draft_status TEXT;
    team_count INTEGER;
    team_ids UUID[];
    week_num INTEGER;
    round_idx INTEGER;  -- 0..6, which round-robin round this week uses
    flip BOOLEAN;       -- reverse home/away for the second meeting
    k INTEGER;
    team1_id UUID;
    team2_id UUID;
    swap_id UUID;
BEGIN
    -- Check if user is league owner
    SELECT EXISTS(
        SELECT 1 FROM league_members lm
        WHERE lm.league_id = p_league_id
          AND lm.user_id = auth.uid()
          AND lm.role = 'owner'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only league owners can generate schedules';
    END IF;

    -- Get fantasy teams in this league
    SELECT array_agg(id ORDER BY team_name), COUNT(*)
    INTO team_ids, team_count
    FROM fantasy_teams
    WHERE league_id = p_league_id;

    IF team_count IS DISTINCT FROM 8 THEN
        RAISE EXCEPTION 'Schedule generation requires exactly 8 fantasy teams (league has %)', COALESCE(team_count, 0);
    END IF;

    -- Phase 2 gate: rosters must exist before a schedule means anything
    SELECT draft_status INTO league_draft_status
    FROM leagues WHERE id = p_league_id;

    IF league_draft_status IS DISTINCT FROM 'complete' THEN
        RAISE EXCEPTION 'Schedule generation requires a completed draft (draft is %)', league_draft_status;
    END IF;

    -- Phase 5 gate: regenerate is pre-season only. Once any week is locked
    -- or any matchup has a recorded result, the schedule is frozen.
    IF EXISTS(
        SELECT 1 FROM weeks w
        WHERE w.league_id = p_league_id AND w.is_locked
    ) OR EXISTS(
        SELECT 1 FROM league_matchups lm
        WHERE lm.league_id = p_league_id AND lm.is_complete
    ) THEN
        RAISE EXCEPTION 'The season has started (locked weeks or recorded scores exist); the schedule can no longer be regenerated';
    END IF;

    -- Clear existing matchups
    DELETE FROM league_matchups WHERE league_id = p_league_id;

    FOR week_num IN 1..18 LOOP
        round_idx := (week_num - 1) % 7;
        flip := week_num BETWEEN 8 AND 14;

        -- Circle method: team 8 is fixed, teams 1-7 rotate.
        -- k = 0 pairs the rotating slot with the fixed team;
        -- k = 1..3 pair positions equidistant around the circle.
        FOR k IN 0..3 LOOP
            IF k = 0 THEN
                team1_id := team_ids[round_idx + 1];
                team2_id := team_ids[8];
            ELSE
                team1_id := team_ids[((round_idx + k) % 7) + 1];
                team2_id := team_ids[((round_idx - k + 7) % 7) + 1];
            END IF;

            IF flip THEN
                swap_id := team1_id;
                team1_id := team2_id;
                team2_id := swap_id;
            END IF;

            INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id)
            VALUES (p_league_id, week_num, team1_id, team2_id);
        END LOOP;
    END LOOP;

    -- Log the action
    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        auth.uid(),
        'GENERATE',
        'schedule',
        p_league_id,
        jsonb_build_object(
            'team_count', team_count,
            'weeks_generated', 18,
            'matchups_generated', 72
        )
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_league_schedule TO authenticated;

COMMENT ON FUNCTION generate_league_schedule IS 'Generate 18-week round-robin schedule; requires 8 teams and a completed draft; pre-season only';

-- Verification (see scripts/verify-phase5.mjs for the executable version):
--
--   SELECT transfer_commissioner('<league>', '<member-user-id>');
--   SELECT remove_league_member('<league>', '<member-user-id>');   -- errors once draft started
--   SELECT generate_league_schedule('<league>');                   -- errors once a week is locked
--   SELECT delete_league('<league>');
--   SELECT action, entity_type FROM audit_logs ORDER BY created_at DESC LIMIT 5;
