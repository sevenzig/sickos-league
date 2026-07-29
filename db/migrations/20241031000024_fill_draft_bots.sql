-- Dev helper: fill empty fantasy-team slots with unmanaged bots so a
-- commissioner can start a draft without 8 real managers.
-- Owner-only, pending draft only. UI should gate the button to DEV builds.

CREATE OR REPLACE FUNCTION fill_draft_bots(p_league_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_owner BOOLEAN;
    league_draft_status TEXT;
    team_count INTEGER;
    need INTEGER;
    i INTEGER;
    bots_added INTEGER := 0;
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
        RAISE EXCEPTION 'Only league owners can fill draft bots';
    END IF;

    SELECT l.draft_status INTO league_draft_status
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF league_draft_status IS NULL THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'Bots can only be added before the draft starts';
    END IF;

    SELECT COUNT(*) INTO team_count
    FROM fantasy_teams ft
    WHERE ft.league_id = p_league_id;

    need := 8 - team_count;
    IF need <= 0 THEN
        RETURN 0;
    END IF;

    FOR i IN 1..need LOOP
        INSERT INTO fantasy_teams (league_id, team_name, manager_user_id)
        VALUES (p_league_id, 'Bot ' || (team_count + i), NULL);
        bots_added := bots_added + 1;
    END LOOP;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'CREATE',
        'draft_bots',
        p_league_id,
        jsonb_build_object('bots_added', bots_added, 'team_count_after', team_count + bots_added)
    );

    RETURN bots_added;
END;
$$;

GRANT EXECUTE ON FUNCTION fill_draft_bots TO authenticated;

COMMENT ON FUNCTION fill_draft_bots IS
    'Owner-only: insert unmanaged Bot N fantasy teams until the league has 8 (pending draft only)';
