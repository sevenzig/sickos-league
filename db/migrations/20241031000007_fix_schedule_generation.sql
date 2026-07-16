-- Fix generate_league_schedule: proper round-robin packing (circle method)
-- Replaces the version from 20241031000003 which created 1 matchup per week.
--
-- With 8 teams the circle method yields 7 rounds of 4 concurrent matchups:
--   Weeks 1-7   = rounds 1-7
--   Weeks 8-14  = rounds 1-7 rematch with home/away flipped
--   Weeks 15-18 = third meeting of rounds 1-4 (original orientation)
--
-- Guard: requires exactly 8 fantasy teams.
-- (Draft-complete gate will be added in Phase 2.)

CREATE OR REPLACE FUNCTION generate_league_schedule(p_league_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    is_owner BOOLEAN;
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

COMMENT ON FUNCTION generate_league_schedule IS 'Generate 18-week round-robin schedule (4 matchups/week) for an 8-team league (league owners only)';

-- Verification (run in SQL editor against a seeded 8-team league):
--
--   SELECT generate_league_schedule('<league-id>');
--
--   -- Every week 1-18 has exactly 4 matchups:
--   SELECT week, COUNT(*) FROM league_matchups
--   WHERE league_id = '<league-id>' GROUP BY week
--   HAVING COUNT(*) != 4;                        -- expect 0 rows
--
--   -- Every team appears exactly once per week:
--   SELECT week, team_id, COUNT(*) FROM (
--       SELECT week, fantasy_team1_id AS team_id FROM league_matchups WHERE league_id = '<league-id>'
--       UNION ALL
--       SELECT week, fantasy_team2_id FROM league_matchups WHERE league_id = '<league-id>'
--   ) x GROUP BY week, team_id
--   HAVING COUNT(*) != 1;                        -- expect 0 rows
