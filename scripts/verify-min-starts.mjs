// Minimum starts count RPC verification against docker compose stack.
//
// Covers:
//   1. Locked RS weeks count toward starts
//   2. Unlocked week lineup does not increment
//   3. Playoff week (week > RS) does not increment
//   4. All four rostered teams returned (zeros included)
//   5. Non-member denied
//
// Run: node scripts/verify-min-starts.mjs

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
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { error: { message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` } };
  }
  return { httpStatus: res.status, status: res.status, ...json };
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });

function psql(sql) {
  execSync('docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -f -', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

const stamp = Date.now();
const password = 'verify-test-password';

console.log('--- Minimum starts counts ---');

const ownerSignup = await api('/auth/signup', {
  body: { email: `minstart-own-${stamp}@test.local`, username: `ms_own_${stamp}`, password },
});
check('setup: owner sign up', !!ownerSignup.token, ownerSignup.error?.message);
const ownerToken = ownerSignup.token;

const managerSignup = await api('/auth/signup', {
  body: { email: `minstart-mgr-${stamp}@test.local`, username: `ms_mgr_${stamp}`, password },
});
check('setup: manager sign up', !!managerSignup.token, managerSignup.error?.message);
const managerToken = managerSignup.token;
const managerId = managerSignup.user?.id;

const outsiderSignup = await api('/auth/signup', {
  body: { email: `minstart-out-${stamp}@test.local`, username: `ms_out_${stamp}`, password },
});
check('setup: outsider sign up', !!outsiderSignup.token, outsiderSignup.error?.message);
const outsiderToken = outsiderSignup.token;

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `MinStarts ${stamp}`,
    season: 2026,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  ownerToken
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

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
`);
check('setup: seed teams + rosters', true);

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, ownerToken);
const myTeam = fantasyTeams?.find((t) => t.team_name === 'Team 2');
check('setup: Team 2 managed by manager', myTeam?.manager_user_id === managerId);

const { data: allRosters } = await rpc('get_league_rosters', { p_league_id: leagueId }, ownerToken);
const myRoster = (allRosters || [])
  .filter((r) => r.fantasy_team_id === myTeam?.id)
  .sort((a, b) => a.draft_pick_number - b.draft_pick_number);
check('setup: Team 2 has 4 rostered NFL teams', myRoster.length === 4, `got ${myRoster.length}`);

if (!myTeam || myRoster.length !== 4) {
  console.log(`\n${failures} CHECK(S) FAILED — setup incomplete, aborting`);
  process.exit(1);
}

const a = myRoster[0].nfl_team_id;
const b = myRoster[1].nfl_team_id;
const c = myRoster[2].nfl_team_id;
const d = myRoster[3].nfl_team_id;

// Seed lineups + week locks via psql (avoids schedule/finalize machinery).
// Week 1 locked: start A+B
// Week 2 locked: start A+C
// Week 3 unlocked: start A+D  (must NOT count)
// Week 15 playoff: start B+D  (must NOT count; RS default 14)
psql(`
  INSERT INTO fantasy_lineups (fantasy_team_id, week, active_nfl_teams, is_locked)
  VALUES
    ('${myTeam.id}', 1, ARRAY['${a}','${b}']::uuid[], TRUE),
    ('${myTeam.id}', 2, ARRAY['${a}','${c}']::uuid[], TRUE),
    ('${myTeam.id}', 3, ARRAY['${a}','${d}']::uuid[], FALSE),
    ('${myTeam.id}', 15, ARRAY['${b}','${d}']::uuid[], TRUE);

  INSERT INTO weeks (league_id, week_number, is_locked)
  VALUES
    ('${leagueId}', 1, TRUE),
    ('${leagueId}', 2, TRUE),
    ('${leagueId}', 3, FALSE),
    ('${leagueId}', 15, TRUE)
  ON CONFLICT (league_id, week_number) DO UPDATE
  SET is_locked = EXCLUDED.is_locked;
`);
check('setup: seed lineups + week locks', true);

const { data: counts, error: countErr } = await rpc(
  'get_fantasy_team_start_counts',
  { p_fantasy_team_id: myTeam.id },
  managerToken
);
check('RPC returns without error', !countErr && Array.isArray(counts), countErr?.message);
check('RPC returns 4 roster rows', counts?.length === 4, `got ${counts?.length}`);

const byId = Object.fromEntries((counts || []).map((r) => [r.nfl_team_id, r.starts]));
check('team A has 2 starts (weeks 1+2 locked)', byId[a] === 2, `got ${byId[a]}`);
check('team B has 1 start (week 1 only)', byId[b] === 1, `got ${byId[b]}`);
check('team C has 1 start (week 2 only)', byId[c] === 1, `got ${byId[c]}`);
check('team D has 0 starts (only unlocked + playoff)', byId[d] === 0, `got ${byId[d]}`);

const { error: outsiderErr } = await rpc(
  'get_fantasy_team_start_counts',
  { p_fantasy_team_id: myTeam.id },
  outsiderToken
);
check(
  'non-member denied',
  !!outsiderErr && /access denied|not a member/i.test(outsiderErr.message || ''),
  outsiderErr?.message
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
