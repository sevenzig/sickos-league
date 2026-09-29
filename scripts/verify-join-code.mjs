// Multi-use join code verification against docker compose stack.
//
// Covers:
//   1. Owner generates code → public preview valid
//   2. User A redeems with team name → member
//   3. User B redeems same code → member (multi-use)
//   4. Ninth joiner fails when full
//   5. After draft start, redeem fails
//   6. After revoke, preview/redeem fail
//   7. Rotate invalidates old code; new code works
//
// Run: node scripts/verify-join-code.mjs

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

async function signup(label) {
  const email = `verify-join-${label}-${Date.now()}@test.local`;
  const res = await api('/auth/signup', {
    body: {
      email,
      username: email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32),
      password: 'verify-test-password',
    },
  });
  if (!res.token) throw new Error(`signup failed for ${label}: ${res.error?.message}`);
  return { token: res.token, userId: res.user.id, email };
}

console.log('--- Multi-use join code ---');

const owner = await signup('owner');
const userA = await signup('a');
const userB = await signup('b');
const userC = await signup('c');

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Join Code Verify ${Date.now()}`,
    season: 2026,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  owner.token
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

// 1. Owner generates code → preview valid
let code1 = null;
{
  const res = await api(`/leagues/${leagueId}/join-code`, { method: 'POST', token: owner.token });
  code1 = res.code;
  check('1: generate returns code', res.httpStatus < 400 && !!code1 && code1.length === 8, res.error?.message);
  check('1: generate returns invite_path', res.invite_path === `/invite/${code1}`, res.invite_path);

  const preview = await api(`/invites/${code1}`);
  check('1: preview is_valid', preview.httpStatus === 200 && preview.is_valid === true, preview.error?.message);
  check('1: preview league_name set', !!preview.league_name);
}

// 2 + 3. Two users redeem the same code
{
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: code1, p_team_name: 'Team A' },
    userA.token
  );
  check('2: user A redeems', !error, error?.message);
}
{
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: code1, p_team_name: 'Team B' },
    userB.token
  );
  check('3: user B redeems same code (multi-use)', !error, error?.message);
}

// Already-member redeem is idempotent
{
  const { data, error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: code1, p_team_name: 'Anything' },
    userA.token
  );
  check('3b: already-member redeem returns league id', !error && data === leagueId, error?.message);
}

// 4. Fill to 8, then ninth fails
{
  psql(`
    INSERT INTO fantasy_teams (league_id, team_name)
    SELECT '${leagueId}', x.team_name
    FROM (VALUES
      ('Team 4'), ('Team 5'), ('Team 6'), ('Team 7'), ('Team 8')
    ) AS x(team_name);
  `);
  // owner + A + B + 5 = 8
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: code1, p_team_name: 'Team Overflow' },
    userC.token
  );
  check('4: ninth joiner rejected when full', !!error, error?.message);

  const preview = await api(`/invites/${code1}`);
  check('4: preview is_valid false when full', preview.is_valid === false);
}

// Free a seat so later tests can use redeem again (draft / revoke / rotate)
psql(`DELETE FROM fantasy_teams WHERE league_id = '${leagueId}' AND team_name = 'Team 8';`);

// 5. After draft start, redeem fails
{
  // Need 8 teams for start_draft in most modes — re-add Team 8
  psql(`
    INSERT INTO fantasy_teams (league_id, team_name)
    VALUES ('${leagueId}', 'Team 8');
  `);
  const { error: startErr } = await rpc('start_draft', { p_league_id: leagueId }, owner.token);
  check('5: start_draft', !startErr, startErr?.message);

  const late = await signup('late');
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: code1, p_team_name: 'Too Late' },
    late.token
  );
  check('5: redeem rejected after draft start', !!error, error?.message);

  const preview = await api(`/invites/${code1}`);
  check('5: preview is_valid false after draft start', preview.is_valid === false);
}

// Fresh league for revoke + rotate (draft already started on first)
const { data: league2, error: league2Err } = await rpc(
  'create_league',
  {
    league_name: `Join Code Rotate ${Date.now()}`,
    season: 2026,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Two',
  },
  owner.token
);
check('setup: second league', !league2Err && !!league2, league2Err?.message);

let codeOld = null;
let codeNew = null;
{
  const gen = await api(`/leagues/${league2}/join-code`, { method: 'POST', token: owner.token });
  codeOld = gen.code;
  check('6: generate on league 2', !!codeOld, gen.error?.message);

  const rev = await api(`/leagues/${league2}/join-code`, { method: 'DELETE', token: owner.token });
  check('6: revoke ok', !rev.error && rev.ok === true, rev.error?.message);

  const preview = await api(`/invites/${codeOld}`);
  check('6: preview 404 after revoke', preview.httpStatus === 404 || preview.error);

  const joiner = await signup('revoked');
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: codeOld, p_team_name: 'Revoked Join' },
    joiner.token
  );
  check('6: redeem fails after revoke', !!error, error?.message);
}

{
  const gen = await api(`/leagues/${league2}/join-code`, { method: 'POST', token: owner.token });
  codeOld = gen.code;
  const rot = await api(`/leagues/${league2}/join-code`, { method: 'POST', token: owner.token });
  codeNew = rot.code;
  check('7: rotate returns new code', !!codeNew && codeNew !== codeOld, rot.error?.message);

  const oldPreview = await api(`/invites/${codeOld}`);
  check('7: old code preview fails', oldPreview.httpStatus === 404 || oldPreview.error);

  const newPreview = await api(`/invites/${codeNew}`);
  check('7: new code preview valid', newPreview.is_valid === true, newPreview.error?.message);

  const rotJoiner = await signup('rotated');
  const { error: oldErr } = await rpc(
    'redeem_invite_code',
    { p_invite_code: codeOld, p_team_name: 'Old Code' },
    rotJoiner.token
  );
  check('7: old code redeem fails', !!oldErr, oldErr?.message);

  const { error: newErr } = await rpc(
    'redeem_invite_code',
    { p_invite_code: codeNew, p_team_name: 'New Code Team' },
    rotJoiner.token
  );
  check('7: new code redeem works', !newErr, newErr?.message);
}

// Password join hard-retired
{
  const res = await api(`/leagues/${leagueId}/join`, {
    method: 'POST',
    token: userC.token,
    body: { password: 'anything', team_name: 'Nope' },
  });
  check('password join returns 410', res.httpStatus === 410, `status=${res.httpStatus}`);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll join-code checks passed');
