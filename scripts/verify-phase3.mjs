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

// --- A1: kickoff game_time seed + set_fantasy_lineup enforcement (week 2) -----
// Uses week 2 so week-1 lock/finalize checks below stay independent.
{
  psql(`UPDATE auth.users SET is_platform_admin = true WHERE id = '${ownerSignup.user?.id}';`);

  const nameLines = execSync(
    `docker compose exec -T db psql -U postgres -t -A -F "|" -c "SELECT uuid_id::text, name FROM teams WHERE uuid_id IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}') OR (is_nfl AND uuid_id NOT IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}')) ORDER BY CASE WHEN uuid_id IN ('${myRoster[0].nfl_team_id}','${myRoster[1].nfl_team_id}') THEN 0 ELSE 1 END, name LIMIT 4"`,
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
  const extras = nameLines.filter(
    (r) => r.uuid !== myRoster[0].nfl_team_id && r.uuid !== myRoster[1].nfl_team_id
  );
  const oppPast = extras[0]?.name;
  const oppFuture = extras[1]?.name || extras[0]?.name;
  check(
    'A1 setup: resolved NFL names for kickoff seed',
    !!(pastName && futureName && oppPast && oppFuture && oppPast !== pastName && oppFuture !== futureName),
    `${pastName}/${futureName}/${oppPast}/${oppFuture}`
  );

  const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const games = [
    { team1: pastName, team2: oppPast, game_time: pastIso },
    { team1: futureName, team2: oppFuture, game_time: futureIso },
  ];

  const { data: written, error: upErr } = await rpc(
    'upsert_nfl_kickoff_times',
    { p_week: 2, p_games: JSON.stringify(games) },
    ownerToken
  );
  check('A1: upsert_nfl_kickoff_times writes week-2 games', !upErr && written === 2, upErr?.message ?? `written=${written}`);

  const countBefore = Number(
    execSync(
      'docker compose exec -T db psql -U postgres -t -A -c "SELECT COUNT(*) FROM matchups WHERE week = 2"',
      { encoding: 'utf8' }
    ).trim()
  );
  const { data: written2, error: upErr2 } = await rpc(
    'upsert_nfl_kickoff_times',
    { p_week: 2, p_games: JSON.stringify(games) },
    ownerToken
  );
  const countAfter = Number(
    execSync(
      'docker compose exec -T db psql -U postgres -t -A -c "SELECT COUNT(*) FROM matchups WHERE week = 2"',
      { encoding: 'utf8' }
    ).trim()
  );
  check(
    'A1: re-upsert is idempotent (no duplicate rows)',
    !upErr2 && written2 === 2 && countAfter === countBefore,
    `before=${countBefore} after=${countAfter}`
  );

  const { data: kickoffs, error: koErr } = await rpc('get_nfl_kickoff_times', { p_week: 2 }, managerToken);
  check(
    'A1: get_nfl_kickoff_times returns seeded rows',
    !koErr && Array.isArray(kickoffs) && kickoffs.length >= 2,
    koErr?.message ?? `n=${kickoffs?.length}`
  );
  check(
    'A1: kickoffs include past roster team',
    !!kickoffs?.some((k) => k.nfl_team_id === myRoster[0].nfl_team_id)
  );

  {
    const { error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: myLineup },
      managerToken
    );
    check(
      'A1: past kickoff blocks non-owner lineup',
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
    check('A1: owner override still allowed after kickoff', !error && data === true, error?.message);
  }
  {
    // myRoster[0] is past-kickoff; start two teams that are not past-locked.
    const futureOnly = [myRoster[1].nfl_team_id, myRoster[2].nfl_team_id];
    const { data, error } = await rpc(
      'set_fantasy_lineup',
      { p_fantasy_team_id: myTeam.id, p_week: 2, p_active_nfl_teams: futureOnly },
      managerToken
    );
    check('A1: future kickoff still allows non-owner lineup', !error && data === true, error?.message);
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

// Lock own lineup, then edits must fail (manager) but owner override works
{
  const { data, error } = await rpc(
    'lock_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1 },
    managerToken
  );
  check('3.1: manager locks own lineup', !error && data === true, error?.message);
}
{
  const { error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: [myRoster[2].nfl_team_id, myRoster[3].nfl_team_id] },
    managerToken
  );
  check('3.1: locked lineup rejects manager edits', !!error, error?.message);
}
{
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: myTeam.id, p_week: 1, p_active_nfl_teams: myLineup },
    ownerToken
  );
  check('3.1: owner override on locked lineup succeeds', !error && data === true, error?.message);
  const { data: after } = await rpc('get_fantasy_lineups_for_week', { p_league_id: leagueId, p_week: 1 }, ownerToken);
  check('3.1: lineup stays locked after owner override', after?.find((l) => l.fantasy_team_id === myTeam.id)?.is_locked === true);
}

// --- 3.2 / 3.3: finalize week (owner-only, auto-fill, full lock) -------------

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
