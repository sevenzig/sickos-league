-- Phase 1.1: Roster ownership - fantasy teams own NFL teams.
--
-- An NFL team belongs to exactly ONE fantasy team's roster per league
-- (UNIQUE(league_id, nfl_team_id)). The 4-teams-per-roster cap is enforced
-- by the draft-pick RPC (Phase 2); rows are only written via SECURITY
-- DEFINER RPCs, so no write RLS policies exist.

CREATE TABLE IF NOT EXISTS fantasy_team_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    fantasy_team_id UUID NOT NULL REFERENCES fantasy_teams(id) ON DELETE CASCADE,
    nfl_team_id UUID NOT NULL REFERENCES teams(uuid_id),
    acquired_via TEXT NOT NULL DEFAULT 'draft',
    draft_pick_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT fantasy_team_rosters_league_nfl_unique UNIQUE (league_id, nfl_team_id),
    CONSTRAINT fantasy_team_rosters_acquired_via_check CHECK (acquired_via IN ('draft', 'commissioner'))
);

CREATE INDEX IF NOT EXISTS fantasy_team_rosters_fantasy_team_idx ON fantasy_team_rosters(fantasy_team_id);

COMMENT ON TABLE fantasy_team_rosters IS 'Which NFL teams each fantasy team owns (populated by the draft)';
COMMENT ON COLUMN fantasy_team_rosters.nfl_team_id IS 'References teams.uuid_id';

-- RLS: league members read; no write policies (writes only via SECURITY DEFINER RPCs)
ALTER TABLE fantasy_team_rosters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fantasy_team_rosters_member_read ON fantasy_team_rosters;
CREATE POLICY fantasy_team_rosters_member_read ON fantasy_team_rosters
    FOR SELECT USING (is_league_member(league_id));

-- Read RPC: one fantasy team's roster
CREATE OR REPLACE FUNCTION get_team_roster(p_fantasy_team_id UUID)
RETURNS TABLE (
    nfl_team_id UUID,
    nfl_team_name TEXT,
    acquired_via TEXT,
    draft_pick_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    team_league_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT ft.league_id INTO team_league_id
    FROM fantasy_teams ft
    WHERE ft.id = p_fantasy_team_id;

    IF team_league_id IS NULL THEN
        RAISE EXCEPTION 'Fantasy team not found';
    END IF;

    IF NOT is_league_member(team_league_id) THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        ftr.nfl_team_id,
        t.name::TEXT,
        ftr.acquired_via,
        ftr.draft_pick_number
    FROM fantasy_team_rosters ftr
    JOIN teams t ON t.uuid_id = ftr.nfl_team_id
    WHERE ftr.fantasy_team_id = p_fantasy_team_id
    ORDER BY ftr.draft_pick_number NULLS LAST, t.name;
END;
$$;

-- Read RPC: all rosters in a league (draft board / roster pages)
CREATE OR REPLACE FUNCTION get_league_rosters(p_league_id UUID)
RETURNS TABLE (
    fantasy_team_id UUID,
    fantasy_team_name TEXT,
    nfl_team_id UUID,
    nfl_team_name TEXT,
    acquired_via TEXT,
    draft_pick_number INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF NOT is_league_member(p_league_id) THEN
        RAISE EXCEPTION 'Access denied: User is not a member of this league';
    END IF;

    RETURN QUERY
    SELECT
        ftr.fantasy_team_id,
        ft.team_name,
        ftr.nfl_team_id,
        t.name::TEXT,
        ftr.acquired_via,
        ftr.draft_pick_number
    FROM fantasy_team_rosters ftr
    JOIN fantasy_teams ft ON ft.id = ftr.fantasy_team_id
    JOIN teams t ON t.uuid_id = ftr.nfl_team_id
    WHERE ftr.league_id = p_league_id
    ORDER BY ft.team_name, ftr.draft_pick_number NULLS LAST, t.name;
END;
$$;

GRANT EXECUTE ON FUNCTION get_team_roster TO authenticated;
GRANT EXECUTE ON FUNCTION get_league_rosters TO authenticated;

-- Verification (run in SQL editor against a seeded league):
--
--   -- Duplicate NFL team in the same league is rejected:
--   INSERT INTO fantasy_team_rosters (league_id, fantasy_team_id, nfl_team_id)
--   VALUES ('<league>', '<team-b>', '<nfl-team-already-on-team-a>');
--   -- expect: unique violation on fantasy_team_rosters_league_nfl_unique
--
--   SELECT * FROM get_team_roster('<fantasy-team-id>');
--   SELECT * FROM get_league_rosters('<league-id>');
