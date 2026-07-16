// Phase 4 verification against the self-contained stack (docker compose up).
//
// Covers:
//   4.1  abbr -> name round-trip for all 32 teams (teamNameMap vs teams table)
//   4.2  finalize_week_scores persists hand-computable sums; NULL when a
//        lineup is missing; idempotent on re-run
//   4.5  one site-wide stats upload + one finalize call updates TWO leagues
//
// Run: node scripts/verify-phase4.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL || 'http://localhost:3001/api';
const SEASON = 2025;
const WEEK = 1;

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
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` } };
  }
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });
const dbq = (query, token) => api('/db/query', { body: query, token });

// ---------------------------------------------------------------------------
// 1. Extract THE mapping (teamNameMap in src/utils/csvParser.ts).
//    It is a static literal, so pull the pairs from the source text — this
//    tests the real map the CSV importer uses, without a TS build step.
// ---------------------------------------------------------------------------
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const parserSource = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'csvParser.ts'), 'utf8');
const mapBlock = parserSource.slice(
  parserSource.indexOf('export const teamNameMap'),
  parserSource.indexOf('};', parserSource.indexOf('export const teamNameMap'))
);
const teamNameMap = {};
for (const m of mapBlock.matchAll(/'([A-Z]{2,3})':\s*'([^']+)'/g)) {
  teamNameMap[m[1]] = m[2];
}
const mappedNames = Object.values(teamNameMap);
check('teamNameMap has 32 entries', mappedNames.length === 32, `got ${mappedNames.length}`);

// ---------------------------------------------------------------------------
// 2. Auth
// ---------------------------------------------------------------------------
const email = `verify4-${Date.now()}@test.local`;
const signup = await api('/auth/signup', { body: { email, password: 'verify-test-password' } });
check('auth: sign up test user', !!signup.token, signup.error?.message ?? email);
const token = signup.token;

// ---------------------------------------------------------------------------
// 3. Round-trip (4.1): every mapped name matches exactly one teams row, and
//    every teams row is reachable from the map.
// ---------------------------------------------------------------------------
const { data: nflTeams, error: teamsErr } = await dbq(
  {
    table: 'teams',
    action: 'select',
    select: 'uuid_id, name',
    filters: [{ op: 'eq', column: 'is_nfl', value: true }],
  },
  token
);
if (teamsErr) throw new Error(teamsErr.message);
const uuidByName = new Map(nflTeams.map((t) => [t.name, t.uuid_id]));
check(
  'round-trip: all 32 mapped names exist in teams',
  mappedNames.every((n) => uuidByName.has(n)),
  mappedNames.filter((n) => !uuidByName.has(n)).join(', ') || undefined
);
check(
  'round-trip: all 32 teams rows are covered by the map',
  nflTeams.filter((t) => mappedNames.includes(t.name)).length === nflTeams.length &&
    nflTeams.length === 32,
  `teams=${nflTeams.length}`
);

// ---------------------------------------------------------------------------
// 4. Two leagues, 8 teams each, schedules generated
// ---------------------------------------------------------------------------
async function makeLeague(label) {
  const { data: leagueId, error } = await rpc(
    'create_league',
    {
      league_name: `Verify4 ${label} ${Date.now()}`,
      season: SEASON,
      teams_started_per_week: 2,
      owner_team_name: `${label} Team 1`,
    },
    token
  );
  if (error) throw new Error(error.message);

  const rows = Array.from({ length: 7 }, (_, i) => ({
    league_id: leagueId,
    team_name: `${label} Team ${i + 2}`,
  }));
  const { error: seedErr } = await dbq({ table: 'fantasy_teams', action: 'insert', values: rows }, token);
  if (seedErr) throw new Error(seedErr.message);

  // Skip the Phase 2 draft (32 picks) - this test seeds lineups directly, so
  // mark the draft complete to pass generate_league_schedule's gate.
  const { error: draftErr } = await dbq(
    {
      table: 'leagues',
      action: 'update',
      values: { draft_status: 'complete' },
      filters: [{ op: 'eq', column: 'id', value: leagueId }],
    },
    token
  );
  if (draftErr) throw new Error(draftErr.message);

  const { error: schedErr } = await rpc('generate_league_schedule', { p_league_id: leagueId }, token);
  if (schedErr) throw new Error(schedErr.message);

  const { data: teams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, token);
  return { leagueId, teams };
}

const leagueA = await makeLeague('A');
const leagueB = await makeLeague('B');
check('two leagues created with schedules', leagueA.teams.length === 8 && leagueB.teams.length === 8);

// ---------------------------------------------------------------------------
// 5. Week-1 stats for all 32 teams with known scores (site-wide, one upload).
//    Deterministic: sorted-name index i -> final_score 3i - 10.
// ---------------------------------------------------------------------------
const sortedNames = [...mappedNames].sort();
const scoreByName = new Map(sortedNames.map((n, i) => [n, 3 * i - 10]));

await dbq(
  {
    table: 'game_stats',
    action: 'delete',
    filters: [
      { op: 'eq', column: 'week', value: WEEK },
      { op: 'eq', column: 'season', value: SEASON },
    ],
  },
  token
);
const { error: statsErr } = await dbq(
  {
    table: 'game_stats',
    action: 'insert',
    values: sortedNames.map((name) => ({
      team_abbr: name,
      week: WEEK,
      season: SEASON,
      final_score: scoreByName.get(name),
    })),
  },
  token
);
check('week-1 game_stats inserted for all 32 teams', !statsErr, statsErr?.message);

// ---------------------------------------------------------------------------
// 6. Lineups: each fantasy team starts 2 NFL teams (sorted-name slices).
//    League A's 8th team gets NO lineup -> its matchup must stay unscored.
// ---------------------------------------------------------------------------
function lineupNames(i) {
  return [sortedNames[2 * i], sortedNames[2 * i + 1]];
}
async function insertLineups(league, skipLastTeam) {
  const rows = [];
  league.teams.forEach((team, i) => {
    if (skipLastTeam && i === league.teams.length - 1) return;
    rows.push({
      fantasy_team_id: team.id,
      week: WEEK,
      active_nfl_teams: lineupNames(i).map((n) => uuidByName.get(n)),
      is_locked: true,
    });
  });
  const { error } = await dbq({ table: 'fantasy_lineups', action: 'insert', values: rows }, token);
  if (error) throw new Error(error.message);
}
await insertLineups(leagueA, true);
await insertLineups(leagueB, false);
check('lineups inserted (league A missing one team)', true);

// Lock week 1 in both leagues
for (const { leagueId } of [leagueA, leagueB]) {
  const { error } = await rpc(
    'toggle_week_lock',
    { p_league_id: leagueId, p_week_number: WEEK, p_lock_state: true },
    token
  );
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// 7. ONE finalize call scores BOTH leagues (4.2 + 4.5)
// ---------------------------------------------------------------------------
const { data: finalized, error: finErr } = await rpc(
  'finalize_week_scores',
  { p_week: WEEK, p_season: SEASON },
  token
);
// >= 7: finalize is site-wide, so leagues left behind by earlier runs of this
// script (their week 1 is also locked) are recounted. Per-league exactness is
// asserted below via checkLeagueScores.
check(
  'finalize_week_scores finalizes the 7 new matchups (3 in A, 4 in B)',
  !finErr && finalized >= 7,
  finErr?.message ?? `got ${finalized}`
);

function expectedScore(league, fantasyTeamId) {
  const i = league.teams.findIndex((t) => t.id === fantasyTeamId);
  return lineupNames(i).reduce((sum, n) => sum + scoreByName.get(n), 0);
}

async function checkLeagueScores(league, label, missingTeamId) {
  const { data: schedule, error } = await rpc(
    'get_league_schedule',
    { p_league_id: league.leagueId, p_week: WEEK },
    token
  );
  if (error) throw new Error(error.message);

  let scoresOk = true;
  let nullsOk = true;
  let completeCount = 0;
  for (const m of schedule) {
    const hasMissing = m.fantasy_team1_id === missingTeamId || m.fantasy_team2_id === missingTeamId;
    if (hasMissing) {
      if (m.is_complete || m.team1_score !== null || m.team2_score !== null) nullsOk = false;
      continue;
    }
    if (!m.is_complete) scoresOk = false;
    else {
      completeCount++;
      if (
        Number(m.team1_score) !== expectedScore(league, m.fantasy_team1_id) ||
        Number(m.team2_score) !== expectedScore(league, m.fantasy_team2_id)
      ) {
        scoresOk = false;
      }
    }
  }
  const expectedComplete = missingTeamId ? 3 : 4;
  check(`league ${label}: scores match hand-computed lineup sums`, scoresOk && completeCount === expectedComplete, `complete=${completeCount}`);
  if (missingTeamId) {
    check(`league ${label}: matchup with missing lineup stays NULL / incomplete`, nullsOk);
  }
  return schedule;
}

const missingTeamId = leagueA.teams[leagueA.teams.length - 1].id;
const scheduleA = await checkLeagueScores(leagueA, 'A', missingTeamId);
await checkLeagueScores(leagueB, 'B', null);

// ---------------------------------------------------------------------------
// 8. Standings reflect the finalized results
// ---------------------------------------------------------------------------
{
  const { data: standings, error } = await dbq(
    {
      table: 'v_league_standings',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'league_id', value: leagueA.leagueId }],
      order: [{ column: 'rank' }],
    },
    token
  );
  if (error) throw new Error(error.message);

  const played = standings.filter((r) => r.games_played > 0);
  const wins = standings.reduce((s, r) => s + r.wins, 0);
  const losses = standings.reduce((s, r) => s + r.losses, 0);
  check(
    'standings: 6 teams played, 3 wins / 3 losses total',
    played.length === 6 && wins === 3 && losses === 3,
    `played=${played.length} W=${wins} L=${losses}`
  );

  const someComplete = scheduleA.find((m) => m.is_complete);
  const row = standings.find((r) => r.fantasy_team_id === someComplete.fantasy_team1_id);
  check(
    'standings: points_for matches the recorded matchup score',
    Number(row.points_for) === Number(someComplete.team1_score),
    `points_for=${row.points_for} score=${someComplete.team1_score}`
  );
}

// ---------------------------------------------------------------------------
// 9. Idempotency: re-running finalize changes nothing
// ---------------------------------------------------------------------------
{
  const { data: again, error } = await rpc('finalize_week_scores', { p_week: WEEK, p_season: SEASON }, token);
  check(
    'finalize_week_scores is idempotent (same matchup count, same result)',
    !error && again === finalized,
    error?.message ?? `got ${again}, expected ${finalized}`
  );
  await checkLeagueScores(leagueA, 'A (re-run)', missingTeamId);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
