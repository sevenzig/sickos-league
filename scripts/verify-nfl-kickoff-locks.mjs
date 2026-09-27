#!/usr/bin/env node
// Verify per-team kickoff freeze, bye locks, status RPC, and finalize skip-bye.
// Run: node scripts/verify-nfl-kickoff-locks.mjs
// Requires: docker compose up (api :3001, db) with migration 000036 applied.

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL || 'http://localhost:3001/api';
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = Date.now();
// Week within fantasy schedule (1–14) and lineup check constraint; cleared at start
const WEEK = 14;

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
    return { status: res.status, error: { message: `Non-JSON: ${text.slice(0, 200)}` } };
  }
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });

function psql(sql) {
  execSync('docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -f -', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
    cwd: repoRoot,
  });
}

function psqlScalar(sql) {
  return execSync('docker compose exec -T db psql -U postgres -t -A -f -', {
    input: sql,
    encoding: 'utf8',
    cwd: repoRoot,
  }).trim();
}

const ownerEmail = `ko-owner-${stamp}@test.local`;
const managerEmail = `ko-mgr-${stamp}@test.local`;
const password = 'verify-test-password';

// Clear any leftover kickoffs for this week number
psql(`DELETE FROM matchups WHERE week = ${WEEK};`);

const ownerSignup = await api('/auth/signup', {
  body: { email: ownerEmail, username: `ko_own_${stamp}`, password },
});
check('setup: owner sign up', !!ownerSignup.token, ownerSignup.error?.message);
const ownerToken = ownerSignup.token;

const managerSignup = await api('/auth/signup', {
  body: { email: managerEmail, username: `ko_mgr_${stamp}`, password },
});
check('setup: manager sign up', !!managerSignup.token, managerSignup.error?.message);
const managerToken = managerSignup.token;
const managerId = managerSignup.user?.id;

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `KickoffLocks ${stamp}`,
    season: 2025,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  ownerToken
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

psql(`
  UPDATE auth.users SET is_platform_admin = true WHERE id = '${ownerSignup.user?.id}';

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
`);

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, ownerToken);
const myTeam = fantasyTeams?.find((t) => t.team_name === 'Team 2');
check('setup: Team 2 managed by second account', myTeam?.manager_user_id === managerId);

const { data: allRosters } = await rpc('get_league_rosters', { p_league_id: leagueId }, ownerToken);
const rosterOf = (teamId) =>
  allRosters
    .filter((r) => r.fantasy_team_id === teamId)
    .sort((a, b) => a.draft_pick_number - b.draft_pick_number);
const myRoster = rosterOf(myTeam.id);

if (!myTeam || myRoster.length < 4) {
  console.log(`\n${failures} CHECK(S) FAILED — setup incomplete`);
  process.exit(1);
}

// Unseeded week: status empty
{
  const { data, error } = await rpc('get_nfl_week_team_status', { p_week: WEEK }, managerToken);
  check(
    'unseeded: get_nfl_week_team_status empty',
    !error && Array.isArray(data) && data.length === 0,
    error?.message ?? `n=${data?.length}`
  );
}

const nameByUuid = Object.fromEntries(
  psqlScalar(
    `SELECT string_agg(uuid_id::text || '=' || name, '|') FROM teams WHERE uuid_id IN ('${myRoster
      .slice(0, 4)
      .map((r) => r.nfl_team_id)
      .join("','")}')`
  )
    .split('|')
    .filter(Boolean)
    .map((pair) => pair.split('='))
);

const extras = psqlScalar(
  `SELECT string_agg(name, '|' ORDER BY name) FROM (
     SELECT name FROM teams WHERE is_nfl AND uuid_id NOT IN ('${myRoster
       .slice(0, 4)
       .map((r) => r.nfl_team_id)
       .join("','")}')
     ORDER BY name LIMIT 3
   ) s`
).split('|');

const pastName = nameByUuid[myRoster[0].nfl_team_id];
const futureName = nameByUuid[myRoster[1].nfl_team_id];
const future2Name = nameByUuid[myRoster[2].nfl_team_id];
const byeUuid = myRoster[3].nfl_team_id;
const byeName = nameByUuid[byeUuid];

check(
  'setup: resolved names',
  !!(pastName && futureName && future2Name && byeName && extras.length >= 3),
  `${pastName}/${futureName}/${byeName}`
);

const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const games = [
  { team1: pastName, team2: extras[0], game_time: pastIso },
  { team1: futureName, team2: extras[1], game_time: futureIso },
  { team1: future2Name, team2: extras[2], game_time: futureIso },
];

{
  const { data: written, error } = await rpc(
    'upsert_nfl_kickoff_times',
    { p_week: WEEK, p_games: JSON.stringify(games) },
    ownerToken
  );
  check('seed: upsert 3 games', !error && written === 3, error?.message);
}

{
  const { data, error } = await rpc('get_nfl_week_team_status', { p_week: WEEK }, managerToken);
  check('seeded: status has 32 rows', !error && data?.length === 32, error?.message ?? `n=${data?.length}`);
  check(
    'seeded: bye team status=bye',
    !!data?.some((r) => r.nfl_team_id === byeUuid && r.status === 'bye')
  );
  check(
    'seeded: past team status=playing',
    !!data?.some((r) => r.nfl_team_id === myRoster[0].nfl_team_id && r.status === 'playing')
  );
  // team1=away, team2=home in upsert payload
  const pastRow = data?.find((r) => r.nfl_team_id === myRoster[0].nfl_team_id);
  check(
    'seeded: away team has opponent + is_home=false',
    pastRow?.opponent_name === extras[0] && pastRow?.is_home === false,
    JSON.stringify(pastRow)
  );
  const homeRow = data?.find(
    (r) => r.status === 'playing' && r.opponent_name === pastName && r.is_home === true
  );
  check(
    'seeded: home team is_home=true vs past away',
    !!homeRow,
    JSON.stringify(homeRow)
  );
}

const futureOnly = [myRoster[1].nfl_team_id, myRoster[2].nfl_team_id];
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: WEEK, p_active_nfl_teams: futureOnly },
    managerToken
  );
  check('freeze: start future-only OK', !error && data === true, error?.message);
}
{
  const { error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: myTeam.id,
      p_week: WEEK,
      p_active_nfl_teams: [myRoster[0].nfl_team_id, myRoster[1].nfl_team_id],
    },
    managerToken
  );
  check('freeze: cannot newly start kicked-off', !!error && /kicked off/i.test(error.message || ''), error?.message);
}
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: myTeam.id,
      p_week: WEEK,
      p_active_nfl_teams: [myRoster[0].nfl_team_id, myRoster[1].nfl_team_id],
    },
    ownerToken
  );
  check('freeze: owner starts TNF+Sunday', !error && data === true, error?.message);
}
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: myTeam.id,
      p_week: WEEK,
      p_active_nfl_teams: [myRoster[0].nfl_team_id, myRoster[2].nfl_team_id],
    },
    managerToken
  );
  check('freeze: swap Sunday after TNF OK', !error && data === true, error?.message);
}
{
  const { error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: WEEK, p_active_nfl_teams: futureOnly },
    managerToken
  );
  check('freeze: cannot bench TNF', !!error && /bench/i.test(error.message || ''), error?.message);
}

await rpc(
  'set_fantasy_lineup',
  { p_fantasy_team_id: myTeam.id, p_week: WEEK, p_active_nfl_teams: futureOnly },
  ownerToken
);

{
  const { error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: myTeam.id,
      p_week: WEEK,
      p_active_nfl_teams: [myRoster[1].nfl_team_id, byeUuid],
    },
    managerToken
  );
  check('bye: manager cannot start bye', !!error && /bye/i.test(error.message || ''), error?.message);
}
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: myTeam.id,
      p_week: WEEK,
      p_active_nfl_teams: [myRoster[1].nfl_team_id, byeUuid],
    },
    ownerToken
  );
  check('bye: owner can start bye', !error && data === true, error?.message);
}

// Finalize auto-fill must skip bye teams
const team3 = fantasyTeams?.find((t) => t.team_name === 'Team 3');
{
  const { error: schedErr } = await rpc('generate_league_schedule', { p_league_id: leagueId }, ownerToken);
  check('finalize setup: generate schedule', !schedErr, schedErr?.message);

  const t3Roster = rosterOf(team3.id);
  const byePick = t3Roster[0]?.nfl_team_id;
  check('finalize setup: Team 3 has roster', !!byePick && t3Roster.length >= 3);

  // Resolve names for Team 3 slots so we can ensure picks 2–3 are playing
  const t3Names = Object.fromEntries(
    psqlScalar(
      `SELECT string_agg(uuid_id::text || '=' || name, '|') FROM teams WHERE uuid_id IN ('${t3Roster
        .slice(0, 3)
        .map((r) => r.nfl_team_id)
        .join("','")}')`
    )
      .split('|')
      .filter(Boolean)
      .map((pair) => pair.split('='))
  );
  const moreOpps = psqlScalar(
    `SELECT string_agg(name, '|' ORDER BY name) FROM (
       SELECT name FROM teams WHERE is_nfl
         AND uuid_id NOT IN ('${[...t3Roster.slice(0, 3).map((r) => r.nfl_team_id), byeUuid].join("','")}')
       ORDER BY name LIMIT 2
     ) s`
  ).split('|');

  // Force pick 1 onto bye; ensure picks 2–3 have kickoffs so auto-fill can succeed
  psql(`
    DELETE FROM fantasy_lineups WHERE fantasy_team_id = '${team3.id}' AND week = ${WEEK};
    DELETE FROM matchups m
    USING teams t
    WHERE m.week = ${WEEK}
      AND t.uuid_id = '${byePick}'
      AND (m.team1_id = t.id OR m.team2_id = t.id);
  `);

  const ensureGames = [
    {
      team1: t3Names[t3Roster[1].nfl_team_id],
      team2: moreOpps[0],
      game_time: futureIso,
    },
    {
      team1: t3Names[t3Roster[2].nfl_team_id],
      team2: moreOpps[1],
      game_time: futureIso,
    },
  ];
  {
    const { error } = await rpc(
      'upsert_nfl_kickoff_times',
      { p_week: WEEK, p_games: JSON.stringify(ensureGames) },
      ownerToken
    );
    check('finalize setup: seed Team 3 non-bye games', !error, error?.message);
  }

  // Only Team 3 should be auto-filled — give every other team a complete lineup
  const { data: statusRows } = await rpc('get_nfl_week_team_status', { p_week: WEEK }, ownerToken);
  const playingIds = new Set(
    (statusRows || []).filter((r) => r.status === 'playing').map((r) => r.nfl_team_id)
  );
  for (const ft of fantasyTeams) {
    if (ft.id === team3.id) continue;
    const r = rosterOf(ft.id);
    const picks = r.map((x) => x.nfl_team_id).filter((id) => playingIds.has(id)).slice(0, 2);
    if (picks.length < 2) {
      // Owner override can include byes so finalize has nothing to fill
      picks.push(...r.map((x) => x.nfl_team_id).filter((id) => !picks.includes(id)).slice(0, 2 - picks.length));
    }
    await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: ft.id, p_week: WEEK, p_active_nfl_teams: picks.slice(0, 2) },
      ownerToken
    );
  }

  const stillSeeded = Number(
    psqlScalar(`SELECT COUNT(*) FROM matchups WHERE week = ${WEEK} AND game_time IS NOT NULL`)
  );
  check('finalize setup: week still seeded after bye carve-out', stillSeeded > 0, `n=${stillSeeded}`);

  const { error: finErr } = await rpc(
    'finalize_week_lineups',
    { p_league_id: leagueId, p_week: WEEK },
    ownerToken
  );
  check('finalize: runs', !finErr, finErr?.message);

  const lineupJson = psqlScalar(
    `SELECT active_nfl_teams::text FROM fantasy_lineups WHERE fantasy_team_id = '${team3.id}' AND week = ${WEEK}`
  );
  check(
    'finalize: auto-fill does not include bye team',
    !!lineupJson && !lineupJson.includes(byePick),
    `lineup=${lineupJson} bye=${byePick}`
  );
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
