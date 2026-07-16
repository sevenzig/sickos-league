-- The legacy single-league path stores the 8 friends' fantasy teams in the
-- same `teams` table as the 32 NFL teams, so "is a row in teams" is not the
-- same as "is an NFL team". Without this flag, make_draft_pick would accept
-- a legacy friend-team row as a draftable NFL team.
--
-- The column is backfilled here for existing databases; db/seed.sql keeps it
-- true for the canonical 32 on every boot (covering fresh databases, where
-- seeds run after migrations).

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_nfl BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN teams.is_nfl IS 'TRUE for the 32 canonical NFL teams; FALSE for legacy friend-team rows';

UPDATE teams SET is_nfl = TRUE WHERE name IN (
    'Arizona', 'Atlanta', 'Baltimore', 'Buffalo',
    'Carolina', 'Chicago', 'Cincinnati', 'Cleveland',
    'Dallas', 'Denver', 'Detroit', 'Green Bay',
    'Houston', 'Indianapolis', 'Jacksonville', 'Kansas City',
    'Las Vegas', 'LA Chargers', 'LA Rams', 'Miami',
    'Minnesota', 'New England', 'New Orleans', 'NY Giants',
    'NY Jets', 'Philadelphia', 'Pittsburgh', 'San Francisco',
    'Seattle', 'Tampa Bay', 'Tennessee', 'Washington'
);

-- Tighten the draft pick validation to NFL teams only
CREATE OR REPLACE FUNCTION draft_execute_pick(
    p_league_id UUID,
    p_nfl_team_id UUID,
    p_require_manager BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    league_draft_status TEXT;
    current_pick INTEGER;
    pick_id UUID;
    picking_team_id UUID;
    picking_team_manager UUID;
BEGIN
    current_user_id := auth.uid();

    -- Lock the league row so concurrent picks serialize
    SELECT l.draft_status, l.draft_current_pick
    INTO league_draft_status, current_pick
    FROM leagues l WHERE l.id = p_league_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'League not found';
    END IF;

    IF league_draft_status IS DISTINCT FROM 'in_progress' THEN
        RAISE EXCEPTION 'Draft is not in progress';
    END IF;

    SELECT dp.id, dp.fantasy_team_id, ft.manager_user_id
    INTO pick_id, picking_team_id, picking_team_manager
    FROM draft_picks dp
    JOIN fantasy_teams ft ON ft.id = dp.fantasy_team_id
    WHERE dp.league_id = p_league_id AND dp.pick_number = current_pick;

    IF p_require_manager AND (picking_team_manager IS NULL OR picking_team_manager != current_user_id) THEN
        RAISE EXCEPTION 'It is not your pick (pick % belongs to another team)', current_pick;
    END IF;

    IF NOT EXISTS(SELECT 1 FROM teams t WHERE t.uuid_id = p_nfl_team_id AND t.is_nfl) THEN
        RAISE EXCEPTION 'Invalid NFL team ID provided';
    END IF;

    IF EXISTS(
        SELECT 1 FROM draft_picks dp
        WHERE dp.league_id = p_league_id AND dp.nfl_team_id = p_nfl_team_id
    ) THEN
        RAISE EXCEPTION 'That NFL team has already been drafted';
    END IF;

    UPDATE draft_picks
    SET nfl_team_id = p_nfl_team_id, picked_at = NOW()
    WHERE id = pick_id;

    INSERT INTO fantasy_team_rosters (league_id, fantasy_team_id, nfl_team_id, acquired_via, draft_pick_number)
    VALUES (p_league_id, picking_team_id, p_nfl_team_id, 'draft', current_pick);

    IF current_pick >= 32 THEN
        UPDATE leagues
        SET draft_status = 'complete', draft_current_pick = NULL
        WHERE id = p_league_id;
    ELSE
        UPDATE leagues
        SET draft_current_pick = current_pick + 1
        WHERE id = p_league_id;
    END IF;

    INSERT INTO audit_logs (league_id, user_id, action, entity_type, entity_id, details)
    VALUES (
        p_league_id,
        current_user_id,
        'PICK',
        'draft_pick',
        pick_id,
        jsonb_build_object(
            'pick_number', current_pick,
            'fantasy_team_id', picking_team_id,
            'nfl_team_id', p_nfl_team_id,
            'is_commissioner_override', NOT p_require_manager
        )
    );

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION draft_execute_pick FROM authenticated;
