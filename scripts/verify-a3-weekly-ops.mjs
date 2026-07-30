// Prompt A3: end-to-end weekly ops dry run against live compose.
//
// Exercises manager set/lock, commissioner finalize_week_lineups (incl. autostart),
// platform-admin week-1 fixture CSV → game_stats → finalize_week_scores,
// standings + idempotent re-finalize. Not a substitute for browser UI, but proves
// the same RPC path LeagueView / CommissionerLineups / csvImporter use.
//
// Run: node scripts/verify-a3-weekly-ops.mjs
// Requires: docker compose up (api :3001, db)

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL || 'http://localhost:3001/api';
const SEASON = 2025;
const WEEK = 1;
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(
  repoRoot,
  'weekly-scoring-data',
  'BQBL 2025 WEEK 01.xlsx - fdata_week01.csv'
);

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(pathname, { method, body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${pathname}`, {
    method: method || (payload !== undefined ? 'POST' : 'GET'),
    headers,
    body: payload,
  });
  const text = await res.text();
  try {
    return { status: res.status, ...(text ? JSON.parse(text) : {}) };
  } catch {
    return {
      status: res.status,
      error: { message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` },
    };
  }
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });
const dbq = (query, token) => api('/db/query', { body: query, token });

function psql(sql) {
  execSync('docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -f -', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
    cwd: repoRoot,
  });
}

// --- Parse fixture the same way csvParser does (ZFinal + teamNameMap) --------
const parserSource = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'csvParser.ts'), 'utf8');
const mapBlock = parserSource.slice(
  parserSource.indexOf('export const teamNameMap'),
  parserSource.indexOf('};', parserSource.indexOf('export const teamNameMap'))
);
const teamNameMap = {};
for (const m of mapBlock.matchAll(/'([A-Z]{2,3})':\s*'([^']+)'/g)) {
  teamNameMap[m[1]] = m[2];
}

function parseFixtureCsv(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  const teamIdx = headers.indexOf('TeamID');
  const finalIdx = headers.indexOf('ZFinal');
  if (teamIdx < 0 || finalIdx < 0) throw new Error('Fixture missing TeamID or ZFinal');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const abbr = values[teamIdx]?.trim();
    if (!abbr) continue;
    const name = teamNameMap[abbr] || abbr;
    const finalScore = Number(values[finalIdx]) || 0;
    rows.push({ team_abbr: name, week: WEEK, season: SEASON, final_score: finalScore });
  }
  return rows;
}

const stamp = Date.now();
const ownerEmail = `a3-owner-${stamp}@test.local`;
const managerEmail = `a3-mgr-${stamp}@test.local`;
const password = 'verify-test-password';

console.log('\n=== A3 weekly ops dry run ===\n');

// ---------------------------------------------------------------------------
// 1. Seed dedicated 8-team dry-run league (draft complete, schedule)
// ---------------------------------------------------------------------------
const ownerSignup = await api('/auth/signup', {
  body: { email: ownerEmail, username: `a3_own_${stamp}`, password },
});
check('setup: owner sign up', !!ownerSignup.token, ownerSignup.error?.message);
const ownerToken = ownerSignup.token;
const ownerId = ownerSignup.user?.id;

const managerSignup = await api('/auth/signup', {
  body: { email: managerEmail, username: `a3_mgr_${stamp}`, password },
});
check('setup: manager sign up', !!managerSignup.token, managerSignup.error?.message);
const managerToken = managerSignup.token;
const managerId = managerSignup.user?.id;

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `A3 DryRun ${stamp}`,
    season: SEASON,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  ownerToken
);
check('setup: create dry-run league', !leagueErr && !!leagueId, leagueErr?.message);

psql(`
  INSERT INTO fantasy_teams (league_id, team_name)
  SELECT '${leagueId}', x.team_name
  FROM (VALUES
    ('Team 2'), ('Team 3'), ('Team 4'), ('Team 5'),
    ('Team 6'), ('Team 7'), ('Team 8')
  ) AS x(team_name);

  INSERT INTO league_members (league_id, user_id, role)
  VALUES ('${leagueId}', '${managerId}', 'member');

  UPDATE fantasy_teams SET manager_user_id = '${managerId}'
  WHERE league_id = '${leagueId}' AND team_name = 'Team 2';

  INSERT INTO fantasy_team_rosters (league_id, fantasy_team_id, nfl_team_id, draft_pick_number)
  SELECT '${leagueId}', ft.id, t.uuid_id, t.rn
  FROM (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS ft_rn
    FROM fantasy_teams WHERE league_id = '${leagueId}'
  ) ft
  JOIN (
    SELECT uuid_id, row_number() OVER (ORDER BY name) AS rn FROM teams
    WHERE name IN (
      'Arizona','Atlanta','Baltimore','Buffalo','Carolina','Chicago',
      'Cincinnati','Cleveland','Dallas','Denver','Detroit','Green Bay',
      'Houston','Indianapolis','Jacksonville','Kansas City','Las Vegas',
      'LA Chargers','LA Rams','Miami','Minnesota','New England',
      'New Orleans','NY Giants','NY Jets','Philadelphia','Pittsburgh',
      'San Francisco','Seattle','Tampa Bay','Tennessee','Washington'
    )
  ) t ON ((t.rn - 1) % 8) + 1 = ft.ft_rn;

  UPDATE leagues SET draft_status = 'complete' WHERE id = '${leagueId}';
`);
check('setup: seed 8 teams + rosters + draft complete via psql', true);

const { error: schedErr } = await rpc('generate_league_schedule', { p_league_id: leagueId }, ownerToken);
check('setup: generate_league_schedule', !schedErr, schedErr?.message);

const { data: allMatchups, error: schedListErr } = await rpc(
  'get_league_schedule',
  { p_league_id: leagueId },
  ownerToken
);
const week1 = (allMatchups || []).filter((m) => m.week === WEEK);
check(
  'AC1: 72 season matchups, 4 in week 1',
  !schedListErr && allMatchups?.length === 72 && week1.length === 4,
  `total=${allMatchups?.length} week1=${week1.length}`
);

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, ownerToken);
const myTeam = fantasyTeams?.find((t) => t.team_name === 'Team 2');
const ownerTeam = fantasyTeams?.find((t) => t.team_name === 'Owner Team');
const emptyTeam = fantasyTeams?.find((t) => t.team_name === 'Team 8');
check('setup: manager owns Team 2', myTeam?.manager_user_id === managerId);

const { data: allRosters } = await rpc('get_league_rosters', { p_league_id: leagueId }, ownerToken);
const rosterOf = (teamId) =>
  allRosters
    .filter((r) => r.fantasy_team_id === teamId)
    .sort((a, b) => a.draft_pick_number - b.draft_pick_number);

const myRoster = rosterOf(myTeam.id);
const myLineup = [myRoster[0].nfl_team_id, myRoster[1].nfl_team_id];

// Opponent for manager in week 1
const mgrMatchup = week1.find(
  (m) => m.fantasy_team1_id === myTeam.id || m.fantasy_team2_id === myTeam.id
);
const opponentId =
  mgrMatchup.fantasy_team1_id === myTeam.id
    ? mgrMatchup.fantasy_team2_id
    : mgrMatchup.fantasy_team1_id;

// ---------------------------------------------------------------------------
// 2. Manager path: set + lock; opponent hidden pre-lock
// ---------------------------------------------------------------------------
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: WEEK, p_active_nfl_teams: myLineup },
    managerToken
  );
  check('AC2: manager saves week-1 lineup', !error && data === true, error?.message);
}
{
  const { data, error } = await rpc(
    'lock_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: WEEK },
    managerToken
  );
  check('AC2: manager locks week-1 lineup', !error && data === true, error?.message);
}

// Give opponent a complete lineup so visibility can be tested once week locks
{
  const oppRoster = rosterOf(opponentId);
  await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: opponentId,
      p_week: WEEK,
      p_active_nfl_teams: [oppRoster[0].nfl_team_id, oppRoster[1].nfl_team_id],
    },
    ownerToken
  );
}

{
  const { data } = await rpc(
    'get_fantasy_lineups_for_week',
    { p_league_id: leagueId, p_week: WEEK },
    managerToken
  );
  const opp = data?.find((l) => l.fantasy_team_id === opponentId);
  const namesHidden =
    !opp ||
    !opp.active_nfl_team_names ||
    opp.active_nfl_team_names.length === 0 ||
    opp.active_nfl_team_names.every((n) => !n);
  check('AC2: opponent lineup hidden pre-week-lock', namesHidden, JSON.stringify(opp?.active_nfl_team_names));
}

// Leave Team 8 without a lineup so commissioner autostart is exercised.
// Fill remaining teams (except Team 8) so week has mostly complete lineups.
for (const t of fantasyTeams) {
  if (t.id === myTeam.id || t.id === opponentId || t.id === emptyTeam.id) continue;
  const r = rosterOf(t.id);
  await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: t.id,
      p_week: WEEK,
      p_active_nfl_teams: [r[0].nfl_team_id, r[1].nfl_team_id],
    },
    ownerToken
  );
}

// ---------------------------------------------------------------------------
// 3. Commissioner path: Finalize Week (autostart empty)
// ---------------------------------------------------------------------------
{
  const { error } = await rpc(
    'finalize_week_lineups',
    { p_league_id: leagueId, p_week: WEEK },
    managerToken
  );
  check('AC3: non-owner cannot finalize week', !!error, error?.message);
}
{
  const { data: autoFilled, error } = await rpc(
    'finalize_week_lineups',
    { p_league_id: leagueId, p_week: WEEK },
    ownerToken
  );
  check(
    'AC3: owner finalize_week_lineups auto-fills empty lineup',
    !error && autoFilled >= 1,
    error?.message ?? `autoFilled=${autoFilled}`
  );
}
{
  // Param names match multiLeagueApi.getWeekStatus (not p_league_id / p_week).
  const { data: statusRows, error } = await rpc(
    'get_week_status',
    { league_id: leagueId, week_number: WEEK },
    ownerToken
  );
  const status = Array.isArray(statusRows) ? statusRows[0] : statusRows;
  check(
    'AC3: week is locked after finalize',
    !error && status?.is_locked === true,
    error?.message ?? JSON.stringify(status)
  );
}
{
  const { data } = await rpc(
    'get_fantasy_lineups_for_week',
    { p_league_id: leagueId, p_week: WEEK },
    managerToken
  );
  const emptyLineup = data?.find((l) => l.fantasy_team_id === emptyTeam.id);
  const expected = rosterOf(emptyTeam.id)
    .slice(0, 2)
    .map((r) => r.nfl_team_id)
    .sort()
    .join(',');
  const got = [...(emptyLineup?.active_nfl_teams || [])].sort().join(',');
  check('AC3: Team 8 autostarted lowest draft picks', got === expected, `got=${got} expected=${expected}`);
}

// ---------------------------------------------------------------------------
// 4. Platform admin: fixture CSV → game_stats → finalize_week_scores
// ---------------------------------------------------------------------------
psql(`UPDATE auth.users SET is_platform_admin = true WHERE id = '${ownerId}';`);
// JWT issued before promote — re-login so is_platform_admin is in token claims if used;
// SECURITY DEFINER checks auth.users via auth.uid(), so same token is fine for RPC.
check('AC4: granted platform admin via psql (docs/ops.md)', true);

const csvText = fs.readFileSync(FIXTURE, 'utf8');
const statsRows = parseFixtureCsv(csvText);
check('AC4: fixture CSV parsed 32 teams', statsRows.length === 32, `got ${statsRows.length}`);

const scoreByName = new Map(statsRows.map((r) => [r.team_abbr, r.final_score]));

await dbq(
  {
    table: 'game_stats',
    action: 'delete',
    filters: [
      { op: 'eq', column: 'week', value: WEEK },
      { op: 'eq', column: 'season', value: SEASON },
    ],
  },
  ownerToken
);
const { error: insertErr } = await dbq(
  { table: 'game_stats', action: 'insert', values: statsRows },
  ownerToken
);
check('AC4: game_stats inserted from fixture', !insertErr, insertErr?.message);

const { data: finalized, error: finErr } = await rpc(
  'finalize_week_scores',
  { p_week: WEEK, p_season: SEASON },
  ownerToken
);
check(
  'AC4: finalize_week_scores runs as platform admin',
  !finErr && typeof finalized === 'number' && finalized >= 1,
  finErr?.message ?? `finalized=${finalized}`
);

// ---------------------------------------------------------------------------
// 5. Scores + standings hand-check
// ---------------------------------------------------------------------------
const { data: nflTeams } = await dbq(
  {
    table: 'teams',
    action: 'select',
    select: 'uuid_id, name',
    filters: [{ op: 'eq', column: 'is_nfl', value: true }],
  },
  ownerToken
);
const nameByUuid = new Map(nflTeams.map((t) => [t.uuid_id, t.name]));

const { data: lockedLineups } = await rpc(
  'get_fantasy_lineups_for_week',
  { p_league_id: leagueId, p_week: WEEK },
  ownerToken
);
const lineupUuids = new Map(
  (lockedLineups || []).map((l) => [l.fantasy_team_id, l.active_nfl_teams || []])
);

function handScore(fantasyTeamId) {
  const uuids = lineupUuids.get(fantasyTeamId) || [];
  if (uuids.length === 0) return null;
  let total = 0;
  for (const id of uuids) {
    const name = nameByUuid.get(id);
    if (!scoreByName.has(name)) return null;
    total += scoreByName.get(name);
  }
  return total;
}

const { data: weekSchedule, error: wkErr } = await rpc(
  'get_league_schedule',
  { p_league_id: leagueId, p_week: WEEK },
  ownerToken
);
check('AC5: week-1 schedule readable', !wkErr && weekSchedule?.length === 4, wkErr?.message);

let scoresOk = true;
let completeCount = 0;
let nullsOk = true;
for (const m of weekSchedule || []) {
  const e1 = handScore(m.fantasy_team1_id);
  const e2 = handScore(m.fantasy_team2_id);
  if (e1 == null || e2 == null) {
    if (m.is_complete || m.team1_score != null || m.team2_score != null) nullsOk = false;
    continue;
  }
  completeCount++;
  if (
    !m.is_complete ||
    Number(m.team1_score) !== e1 ||
    Number(m.team2_score) !== e2
  ) {
    scoresOk = false;
    console.log(
      `    mismatch ${m.fantasy_team1_name} vs ${m.fantasy_team2_name}: ` +
        `got ${m.team1_score}/${m.team2_score} expected ${e1}/${e2}`
    );
  }
}
check(
  'AC5: completed matchup scores match SUM(game_stats.final_score)',
  scoresOk && completeCount === 4,
  `complete=${completeCount}`
);
check('AC5: incomplete matchups stay NULL (none expected with full stats)', nullsOk);

const { data: standings, error: stErr } = await dbq(
  {
    table: 'v_league_standings',
    action: 'select',
    select: '*',
    filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
    order: [{ column: 'rank' }],
  },
  ownerToken
);
check('AC5: v_league_standings readable', !stErr && standings?.length === 8, stErr?.message);

{
  const wins = standings.reduce((s, r) => s + Number(r.wins), 0);
  const losses = standings.reduce((s, r) => s + Number(r.losses), 0);
  const ties = standings.reduce((s, r) => s + Number(r.ties || 0), 0);
  const played = standings.filter((r) => Number(r.games_played) > 0).length;
  // 4 completed matchups → 8 games_played; each result is W, L, or T per side
  check(
    'AC5: standings cover all 8 teams after 4 completed matchups',
    played === 8 && wins + losses + 2 * ties === 8,
    `played=${played} W=${wins} L=${losses} T=${ties}`
  );

  const some = weekSchedule.find((m) => m.is_complete);
  const row = standings.find((r) => r.fantasy_team_id === some.fantasy_team1_id);
  check(
    'AC5: sample points_for matches week-1 score',
    Number(row.points_for) === Number(some.team1_score),
    `pf=${row.points_for} score=${some.team1_score}`
  );
}

// ---------------------------------------------------------------------------
// 6. Idempotent re-finalize
// ---------------------------------------------------------------------------
{
  const before = JSON.stringify(
    (standings || []).map((r) => [r.fantasy_team_id, r.wins, r.losses, r.ties, r.points_for])
  );
  const { data: again, error } = await rpc(
    'finalize_week_scores',
    { p_week: WEEK, p_season: SEASON },
    ownerToken
  );
  const { data: standings2 } = await dbq(
    {
      table: 'v_league_standings',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
      order: [{ column: 'rank' }],
    },
    ownerToken
  );
  const after = JSON.stringify(
    (standings2 || []).map((r) => [r.fantasy_team_id, r.wins, r.losses, r.ties, r.points_for])
  );
  const { data: weekSchedule2 } = await rpc(
    'get_league_schedule',
    { p_league_id: leagueId, p_week: WEEK },
    ownerToken
  );
  const scoresSame = JSON.stringify(
    (weekSchedule || []).map((m) => [m.id, m.team1_score, m.team2_score, m.is_complete])
  ) ===
    JSON.stringify(
      (weekSchedule2 || []).map((m) => [m.id, m.team1_score, m.team2_score, m.is_complete])
    );

  check(
    'AC6: second finalize is no-op for scores + standings',
    !error && again === finalized && before === after && scoresSame,
    error?.message ?? `again=${again} finalized=${finalized}`
  );
}

// ---------------------------------------------------------------------------
// 7. Ops checklist (printed for PR/notes; also mirrored in docs/ops.md)
// ---------------------------------------------------------------------------
console.log(`
=== Ops checklist (human season loop) ===
1. Thursday: remind managers to set lineups (email when A4 live; manual until then).
2. Lineup deadline: managers set+lock via League Lineups; opponents hidden until week lock.
3. Finalize Week: commissioner opens Admin → Weekly Lineups → Finalize Week
   (auto-starts empty lineups from lowest draft picks, locks week).
4. Sunday/Monday: platform admin uploads week CSV at /admin/import
   (grant: UPDATE auth.users SET is_platform_admin = true; re-login).
5. Confirm: LeagueView scores, Standings, WLT chart, matchup modal; re-finalize is safe.
Dry-run league: ${leagueId}
`);
check('AC7: ops checklist emitted for human runner', true);

console.log(failures === 0 ? '\nALL A3 CHECKS PASSED' : `\n${failures} A3 CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
