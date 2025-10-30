-- Multi-League Views Migration
-- Create convenience views for league data access

-- View for league teams with slot information
CREATE OR REPLACE VIEW v_league_teams AS
SELECT
    lt.league_id,
    ts.slot_number,
    lt.team_id,
    t.name as team_name,
    t.abbreviation,
    ts.manager_user_id,
    u.email as manager_email
FROM league_teams lt
JOIN team_slots ts ON lt.slot_id = ts.id
JOIN teams t ON lt.team_id = t.uuid_id
LEFT JOIN auth.users u ON ts.manager_user_id = u.id
ORDER BY ts.slot_number;

-- View for league matchups with team details
CREATE OR REPLACE VIEW v_league_matchups AS
SELECT
    m.uuid_id as matchup_id,
    vlt1.league_id,
    m.week,
    m.team1_uuid_id as team1_id,
    vlt1.team_name as team1_name,
    vlt1.slot_number as team1_slot,
    m.team2_uuid_id as team2_id,
    vlt2.team_name as team2_name,
    vlt2.slot_number as team2_slot,
    m.team1_score,
    m.team2_score,
    m.is_complete
FROM matchups m
JOIN v_league_teams vlt1 ON m.team1_uuid_id = vlt1.team_id
JOIN v_league_teams vlt2 ON m.team2_uuid_id = vlt2.team_id
WHERE vlt1.league_id = vlt2.league_id
ORDER BY vlt1.league_id, m.week, vlt1.slot_number;

-- View for league lineups with lock status
CREATE OR REPLACE VIEW v_league_lineups AS
SELECT
    l.id as lineup_id,
    vlt.league_id,
    l.week,
    l.team_uuid_id as team_id,
    vlt.team_name,
    vlt.slot_number,
    vlt.manager_user_id,
    l.active_qbs_uuid as active_qbs,
    l.is_locked as lineup_locked,
    w.is_locked as week_locked,
    w.locks_at
FROM lineups l
JOIN v_league_teams vlt ON l.team_uuid_id = vlt.team_id
LEFT JOIN weeks w ON w.league_id = vlt.league_id AND w.week_number = l.week
ORDER BY vlt.league_id, l.week, vlt.slot_number;

-- View for league standings calculation
CREATE OR REPLACE VIEW v_league_standings AS
WITH team_records AS (
    SELECT
        league_id,
        team_id,
        team_name,
        slot_number,
        manager_user_id,
        COUNT(CASE WHEN (team1_id = team_id AND team1_score > team2_score)
                   OR (team2_id = team_id AND team2_score > team1_score)
                   THEN 1 END) as wins,
        COUNT(CASE WHEN (team1_id = team_id AND team1_score < team2_score)
                   OR (team2_id = team_id AND team2_score < team1_score)
                   THEN 1 END) as losses,
        COUNT(CASE WHEN (team1_id = team_id AND team1_score = team2_score)
                   OR (team2_id = team_id AND team2_score = team1_score)
                   THEN 1 END) as ties,
        SUM(CASE WHEN team1_id = team_id THEN team1_score
                 WHEN team2_id = team_id THEN team2_score
                 ELSE 0 END) as total_points,
        COUNT(CASE WHEN is_complete = true THEN 1 END) as games_played
    FROM v_league_matchups
    GROUP BY league_id, team_id, team_name, slot_number, manager_user_id
)
SELECT
    league_id,
    team_id,
    team_name,
    slot_number,
    manager_user_id,
    wins,
    losses,
    ties,
    total_points,
    games_played,
    CASE WHEN games_played > 0
         THEN ROUND(total_points::decimal / games_played, 2)
         ELSE 0 END as avg_points,
    ROW_NUMBER() OVER (
        PARTITION BY league_id
        ORDER BY wins DESC, total_points DESC, team_name
    ) as rank
FROM team_records
ORDER BY league_id, rank;

-- View for active invitations
CREATE OR REPLACE VIEW v_active_invitations AS
SELECT
    i.id,
    i.league_id,
    l.name as league_name,
    i.slot_id,
    ts.slot_number,
    ts.team_name,
    i.code,
    i.expires_at,
    i.status,
    i.created_at
FROM invitations i
JOIN leagues l ON i.league_id = l.id
JOIN team_slots ts ON i.slot_id = ts.id
WHERE i.status = 'pending'
  AND i.expires_at > NOW()
ORDER BY i.created_at DESC;