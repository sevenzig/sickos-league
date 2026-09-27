// Phase 3 verification against the self-contained stack (docker compose up).
// Covers the plan's verify criteria:
//   3.1 manager can set/lock a lineup; a second account cannot modify it;
//       non-rostered teams are rejected; opponent lineups hidden pre-lock
//   3.2 finalize locks all lineups and the week; further edits blocked at RPC
//   3.3 finalizing with missing lineups auto-fills lowest-pick rostered teams
//
// Run: node scripts/verify-phase3.mjs
// Roster seeding goes through psql (docker compose exec) because roster rows
// are only writable via SECURITY DEFINER RPCs (the draft) in production.

import { execSync } from 'node:child_process';

const API = process.env.API_URL || 'http://localhost:3001/api';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(path, { method, body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, {
    method: method || (payload !== undefined ? 'POST' : 'GET'),
    headers,
    body: payload,
  });
  const text = await res.text();
  try {
    return { status: res.status, ...(text ? JSON.parse(text) : {}) };
  } catch {
    return { status: res.status, error: { message: `Non-JSON response: ${text.slice(0, 200)}` } };
  }
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });

function psql(sql) {
  execSync('docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -f -', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

const stamp = Date.now();
const ownerEmail = `ph3-owner-${stamp}@test.local`;
const managerEmail = `ph3-manager-${stamp}@test.local`;
const password = 'verify-test-password';

// --- Setup: two users, a league, 8 teams, seeded rosters ---------------------

const ownerSignup = await api('/auth/signup', { body: { email: ownerEmail, username: `ph3_own_${stamp}`, password } });
check('setup: owner sign up', !!ownerSignup.token, ownerSignup.error?.message);
const ownerToken = ownerSignup.token;

const managerSignup = await api('/auth/signup', { body: { email: managerEmail, username: `ph3_mgr_${stamp}`, password } });
check('setup: manager sign up', !!managerSignup.token, managerSignup.error?.message);
const managerToken = managerSignup.token;
const managerId = managerSignup.user?.id;

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Phase3 ${stamp}`,
    season: 2025,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  ownerToken
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

// fantasy_teams has SELECT-only RLS (writes via SECURITY DEFINER RPCs), and
// fantasy_team_rosters has no client write policies — seed both via psql.
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
    -- the teams table also holds legacy fantasy-team rows; only real NFL teams
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
check('setup: seed 7 additional fantasy teams + rosters via psql', true);

// Resolve team ids and rosters (as owner, through the same API the app uses)
const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, ownerToken);
const myTeam = fantasyTeams?.find((t) => t.team_name === 'Team 2');
const ownerTeam = fantasyTeams?.find((t) => t.team_name === 'Owner Team');
const team3 = fantasyTeams?.find((t) => t.team_name === 'Team 3');
check('setup: Team 2 managed by second account', myTeam?.manager_user_id === managerId);

const { data: allRosters } = await rpc('get_league_rosters', { p_league_id: leagueId }, ownerToken);
check('setup: 32 roster entries (8 teams x 4)', allRosters?.length === 32, `got ${allRosters?.length}`);
if (!myTeam || !ownerTeam || !team3 || allRosters?.length !== 32) {
  console.log(`\n${failures} CHECK(S) FAILED — setup incomplete, aborting`);
  process.exit(1);
}
const rosterOf = (teamId) =>
  allRosters
    .filter((r) => r.fantasy_team_id === teamId)
    .sort((a, b) => a.draft_pick_number - b.draft_pick_number);

const myRoster = rosterOf(myTeam.id);
const myLineup = [myRoster[0].nfl_team_id, myRoster[1].nfl_team_id];

// --- A1: kickoff freeze + bye (week 2) ----------------------------------------
// Uses week 2 so week-1 lock/finalize checks below stay independent.
{
  psql(`UPDATE auth.users SET is_platform_admin = true WHERE id = '${ownerSignup.user?.id}';`);

  const nameLines = execSync(
    `docker compose exec -T db psql -U postgres -t -A -F "|" -c "SELECT uuid_id::text, name FROM teams WHERE uuid_id IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}','${myRoster[2].nfl_team_id}','${myRoster[3].nfl_team_id}') OR (is_nfl AND uuid_id NOT IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}','${myRoster[2].nfl_team_id}','${myRoster[3].nfl_team_id}')) ORDER BY CASE WHEN uuid_id IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}','${myRoster[2].nfl_team_id}','${myRoster[3].nfl_team_id}') THEN 0 ELSE 1 END, name LIMIT 8"`,
    { encoding: 'utf8' }
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [uuid, name] = line.split('|');
      return { uuid, name };
    });

  const pastName = nameLines.find((r) => r.uuid === myRoster[0].nfl_team_id)?.name;
  const futureName = nameLines.find((r) => r.uuid === myRoster[1].nfl_team_id)?.name;
  const future2Name = nameLines.find((r) => r.uuid === myRoster[2].nfl_team_id)?.name;
  const byeName = nameLines.find((r) => r.uuid === myRoster[3].nfl_team_id)?.name;
  const extras = nameLines.filter(
    (r) =>
      r.uuid !== myRoster[0].nfl_team_id &&
      r.uuid !== myRoster[1].nfl_team_id &&
      r.uuid !== myRoster[2].nfl_team_id &&
      r.uuid !== myRoster[3].nfl_team_id
  );
  const oppPast = extras[0]?.name;
  const oppFuture = extras[1]?.name;
  const oppFuture2 = extras[2]?.name;
  check(
    'A1 setup: resolved NFL names for kickoff seed',
    !!(pastName && futureName && future2Name && byeName && oppPast && oppFuture && oppFuture2),
    `${pastName}/${futureName}/${future2Name}/${byeName}`
  );

  const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  // Seed three games; leave byeName (roster[3]) without a matchup → bye once seeded
  const games = [
    { team1: pastName, team2: oppPast, game_time: pastIso },
    { team1: futureName, team2: oppFuture, game_time: futureIso },
    { team1: future2Name, team2: oppFuture2, game_time: futureIso },
  ];

  const { data: written, error: upErr } = await rpc(
    'upsert_nfl_kickoff_times',
    { p_week: 2, p_games: JSON.stringify(games) },
    ownerToken
  );
  check('A1: upsert_nfl_kickoff_times writes week-2 games', !upErr && written === 3, upErr?.message ?? `written=${written}`);

  const { data: kickoffs, error: koErr } = await rpc('get_nfl_kickoff_times', { p_week: 2 }, managerToken);
  check(
    'A1: get_nfl_kickoff_times returns seeded rows',
    !koErr && Array.isArray(kickoffs) && kickoffs.length >= 6,
    koErr?.message ?? `n=${kickoffs?.length}`
  );

  const { data: teamStatus, error: stErr } = await rpc('get_nfl_week_team_status', { p_week: 2 }, managerToken);
  check(
    'A1: get_nfl_week_team_status returns 32 teams when seeded',
    !stErr && Array.isArray(teamStatus) && teamStatus.length === 32,
    stErr?.message ?? `n=${teamStatus?.length}`
  );
  check(
    'A1: roster[3] is bye in status RPC',
    !!teamStatus?.some((r) => r.nfl_team_id === myRoster[3].nfl_team_id && r.status === 'bye')
  );

  const futureOnly = [myRoster[1].nfl_team_id, myRoster[2].nfl_team_id];
  {
    const { data, error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: futureOnly },
      managerToken
    );
    check('A1: manager can start future-only lineup', !error && data === true, error?.message);
  }
  {
    const withPast = [myRoster[0].nfl_team_id, myRoster[1].nfl_team_id];
    const { error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: withPast },
      managerToken
    );
    check(
      'A1: cannot newly start a kicked-off team',
      !!error && /kicked off/i.test(error.message || ''),
      error?.message
    );
  }
  {
    const { data, error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: myLineup },
      ownerToken
    );
    check('A1: owner can start kicked-off team', !error && data === true, error?.message);
  }
  {
    // Keep past (TNF), swap Sunday (roster[1] → roster[2])
    const swapSunday = [myRoster[0].nfl_team_id, myRoster[2].nfl_team_id];
    const { data, error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: swapSunday },
      managerToken
    );
    check('A1: manager can swap non-kicked-off slot after TNF', !error && data === true, error?.message);
  }
  {
    const { error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: futureOnly },
      managerToken
    );
    check(
      'A1: cannot bench a kicked-off team',
      !!error && /bench/i.test(error.message || ''),
      error?.message
    );
  }
  // Clear kicked-off starters via owner so bye checks are not masked by bench freeze
  {
    await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: futureOnly },
      ownerToken
    );
  }
  {
    const withBye = [myRoster[1].nfl_team_id, myRoster[3].nfl_team_id];
    const { error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: withBye },
      managerToken
    );
    check(
      'A1: manager cannot start a bye team',
      !!error && /bye/i.test(error.message || ''),
      error?.message
    );
  }
  {
    const withBye = [myRoster[1].nfl_team_id, myRoster[3].nfl_team_id];
    const { data, error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: withBye },
      ownerToken
    );
    check('A1: owner can start a bye team', !error && data === true, error?.message);
  }
  // Restore a valid lineup without bye/past for later week-2 independence
  {
    await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: futureOnly },
      ownerToken
    );
  }
}

// --- 3.1: set/lock own lineup; roster + auth enforcement ---------------------

{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: myLineup },
    managerToken
  );
  check('3.1: manager saves own lineup (rostered teams)', !error && data === true, error?.message);
}
{
  const foreign = rosterOf(ownerTeam.id)[0].nfl_team_id;
  const { error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: [myRoster[0].nfl_team_id, foreign] },
    managerToken
  );
  check('3.1: non-rostered team rejected', !!error, error?.message);
}
{
  const { error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: ownerTeam.id, p_week: 1, p_active_nfl_teams: myLineup.slice(0, 2) },
    managerToken
  );
  check('3.1: second account cannot set another team\'s lineup', !!error, error?.message);
}

// Owner sets Team 3's lineup (owner may manage unmanaged teams) so we can
// test pre-lock visibility from the manager's perspective.
const team3Roster = rosterOf(team3.id);
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    {
      p_fantasy_team_id: team3.id,
      p_week: 1,
      p_active_nfl_teams: [team3Roster[2].nfl_team_id, team3Roster[3].nfl_team_id],
    },
    ownerToken
  );
  check('3.1: owner may set an unmanaged team\'s lineup', !error && data === true, error?.message);
}

{
  const { data } = await rpc('get_fantasy_lineups_for_week', { p_league_id: leagueId, p_week: 1 }, managerToken);
  const mine = data?.find((l) => l.fantasy_team_id === myTeam.id);
  const others = data?.find((l) => l.fantasy_team_id === team3.id);
  check('3.1: manager sees own lineup pre-lock', mine?.active_nfl_teams?.length === 2);
  check('3.1: opponent lineup hidden pre-lock', others?.active_nfl_teams?.length === 0, JSON.stringify(others?.active_nfl_teams));
}
{
  const { data } = await rpc('get_fantasy_lineups_for_week', { p_league_id: leagueId, p_week: 1 }, ownerToken);
  const others = data?.find((l) => l.fantasy_team_id === team3.id);
  check('3.1: owner sees all lineups pre-lock', others?.active_nfl_teams?.length === 2);
}

// Lock own lineup is disabled (voluntary lock removed); manager may re-edit until week finalize / kickoff
{
  const { error } = await rpc(
    'lock_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1 },
    managerToken
  );
  check('3.1: voluntary lock_fantasy_lineup fails', !!error, error?.message);
}
{
  const altLineup = [myRoster[2].nfl_team_id, myRoster[3].nfl_team_id];
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: altLineup },
    managerToken
  );
  check('3.1: manager can re-edit lineup after save', !error && data === true, error?.message);
}
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: myLineup },
    ownerToken
  );
  check('3.1: owner may set manager lineup while week unlocked', !error && data === true, error?.message);
}

// --- 3.2 / 3.3: finalize week (owner-only, auto-fill, full lock) -------------

{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, ownerToken);
  check('3.2 setup: generate_league_schedule', !error, error?.message);
}

{
  const { error } = await rpc('finalize_week_lineups', { p_league_id: leagueId, p_week: 1 }, managerToken);
  check('3.2: finalize rejected for non-owner', !!error, error?.message);
}

{
  const { data: autoFilled, error } = await rpc('finalize_week_lineups', { p_league_id: leagueId, p_week: 1 }, ownerToken);
  // 8 teams; Team 2 and Team 3 already have complete lineups -> 6 auto-filled
  check('3.3: finalize succeeds and auto-fills 6 missing lineups', !error && autoFilled === 6, error?.message ?? `auto_filled=${autoFilled}`);
}

{
  const { data } = await rpc('get_week_status', { league_id: leagueId, week_number: 1 }, ownerToken);
  const row = data?.[0];
  check('3.2: week locked after finalize', row?.is_locked === true, JSON.stringify(row));
  check('3.2: all 8 lineups submitted after finalize', row?.lineups_submitted === 8, `got ${row?.lineups_submitted}`);
}

{
  const { data } = await rpc('get_fantasy_lineups_for_week', { p_league_id: leagueId, p_week: 1 }, ownerToken);
  check('3.2: every lineup locked after finalize', data?.length === 8 && data.every((l) => l.is_locked && l.active_nfl_teams.length === 2));

  // 3.3: an auto-filled team starts its two lowest-pick-number rostered teams
  const autoTeam = fantasyTeams.find((t) => t.team_name === 'Team 4');
  const expected = rosterOf(autoTeam.id).slice(0, 2).map((r) => r.nfl_team_id).sort();
  const actual = [...(data.find((l) => l.fantasy_team_id === autoTeam.id)?.active_nfl_teams ?? [])].sort();
  check('3.3: auto-filled lineup = lowest two draft picks', JSON.stringify(actual) === JSON.stringify(expected));
}

{
  const { error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: myLineup },
    managerToken
  );
  check('3.2: edits blocked at RPC after finalize', !!error, error?.message);
}

{
  const { data } = await rpc('get_fantasy_lineups_for_week', { p_league_id: leagueId, p_week: 1 }, managerToken);
  const others = data?.find((l) => l.fantasy_team_id === team3.id);
  check('3.1: opponent lineup visible once week locked', others?.active_nfl_teams?.length === 2);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
