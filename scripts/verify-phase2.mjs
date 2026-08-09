// Phase 2 verification: async snake draft against the self-contained stack
// (docker compose up). Two accounts run a full 32-pick draft; every rule the
// plan lists is exercised: snake order, turn enforcement, duplicate rejection,
// commissioner override, completion -> rosters, "Your pick!" badge data, and
// the schedule/invite gates.
//
// Run: node scripts/verify-phase2.mjs
// Invite and bot-team seeding goes through psql (docker compose exec) because
// league_invitations and fantasy_teams only have SELECT policies for the app
// user — writes are restricted to SECURITY DEFINER RPCs or superuser paths.

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
  return { status: res.status, ...json };
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });
const dbq = (query, token) => api('/db/query', { body: query, token });

function psql(sql) {
  execSync('docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -f -', {
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

async function signup(label) {
  const email = `verify2-${label}-${Date.now()}@test.local`;
  const res = await api('/auth/signup', { body: { email, username: email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32), password: 'verify-test-password' } });
  if (!res.token) throw new Error(`signup failed for ${label}: ${res.error?.message}`);
  return { token: res.token, userId: res.user.id, email };
}

// --- Setup: owner creates a league; manager B joins via invite ---------------

const owner = await signup('owner');
const managerB = await signup('managerb');

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Draft Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  owner.token
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

// league_invitations has SELECT-only RLS for app_user; seed via psql.
function createInvite(code) {
  psql(`
    INSERT INTO league_invitations (code, league_id, expires_at, is_active)
    VALUES ('${code}', '${leagueId}', NOW() + INTERVAL '1 day', true);
  `);
}

const randomCode = () =>
  Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

const inviteCodeB = randomCode();
{
  createInvite(inviteCodeB);
  check('setup: create invite for manager B', true);
}
{
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: inviteCodeB, p_team_name: 'Team B' },
    managerB.token
  );
  check('setup: manager B joins via invite', !error, error?.message);
}

// Second invite created pre-draft, redeemed post-start to test the gate
const inviteCodeLate = randomCode();
{
  createInvite(inviteCodeLate);
  check('setup: create second invite (for gate test)', true);
}

// fantasy_teams has SELECT-only RLS for app_user; seed bot teams via psql.
{
  psql(`
    INSERT INTO fantasy_teams (league_id, team_name)
    SELECT '${leagueId}', x.team_name
    FROM (VALUES
      ('Team 3'), ('Team 4'), ('Team 5'), ('Team 6'), ('Team 7'), ('Team 8')
    ) AS x(team_name);
  `);
  check('setup: seed 6 additional fantasy teams via psql', true);
}

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
const ownerTeam = fantasyTeams.find((t) => t.manager_user_id === owner.userId);
const teamB = fantasyTeams.find((t) => t.manager_user_id === managerB.userId);

const { data: nflTeams } = await dbq(
  {
    table: 'teams',
    action: 'select',
    select: 'uuid_id, name',
    filters: [{ op: 'eq', column: 'is_nfl', value: true }],
    order: [{ column: 'name' }],
  },
  owner.token
);
check('setup: exactly 32 NFL teams available', nflTeams.length === 32, `got ${nflTeams.length}`);

// --- 2.2 start_draft --------------------------------------------------------

// Non-owner cannot start
{
  const { error } = await rpc('start_draft', { p_league_id: leagueId }, managerB.token);
  check('start_draft rejected for non-owner', !!error, error?.message);
}

// Schedule generation allowed once 8 teams exist (before draft)
{
  const { data, error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('generate_league_schedule succeeds with 8 teams while pending', !error && data === true, error?.message);
}

// Clear matchups so start_draft auto-generation can be asserted
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}';`);
}

// Bad explicit order rejected (duplicate team)
{
  const badOrder = fantasyTeams.slice(0, 7).map((t) => t.id);
  badOrder.push(badOrder[0]);
  const { error } = await rpc('start_draft', { p_league_id: leagueId, p_draft_order: badOrder }, owner.token);
  check('start_draft rejects order with duplicate team', !!error, error?.message);
}

// Explicit order: owner team first, Team B second, rest after (deterministic snake)
const draftOrder = [
  ownerTeam.id,
  teamB.id,
  ...fantasyTeams.filter((t) => t.id !== ownerTeam.id && t.id !== teamB.id).map((t) => t.id),
];
{
  const { data, error } = await rpc('start_draft', { p_league_id: leagueId, p_draft_order: draftOrder }, owner.token);
  check('start_draft succeeds with explicit order', !error && data === true, error?.message);
}

// start_draft auto-generates schedule when none exists
{
  const { data: matchups, error } = await dbq(
    {
      table: 'league_matchups',
      action: 'select',
      select: 'id',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
    },
    owner.token
  );
  check('start_draft auto-generates 72 matchups', !error && matchups?.length === 72, `got ${matchups?.length}`);
}

// Starting twice fails
{
  const { error } = await rpc('start_draft', { p_league_id: leagueId }, owner.token);
  check('start_draft rejected when already started', !!error, error?.message);
}

// Pick slots: 32 rows, 4 per team, correct snake sequence
{
  const { data: state } = await rpc('get_draft_state', { p_league_id: leagueId }, owner.token);
  const picks = state.picks;
  check('32 pick slots pre-created', picks.length === 32, `got ${picks.length}`);

  const perTeam = new Map();
  for (const p of picks) perTeam.set(p.fantasy_team_id, (perTeam.get(p.fantasy_team_id) ?? 0) + 1);
  check('each team has exactly 4 picks', perTeam.size === 8 && [...perTeam.values()].every((v) => v === 4));

  check('draft_format defaults to snake', state.draft_format === 'snake', `got ${state.draft_format}`);

  let snakeOk = true;
  for (const p of picks) {
    const idxInRound = (p.pick_number - 1) % 8;
    const expected = p.round % 2 === 1 ? draftOrder[idxInRound] : draftOrder[7 - idxInRound];
    if (p.fantasy_team_id !== expected) snakeOk = false;
  }
  check('picks follow snake order (rounds 1&3 forward, 2&4 reverse)', snakeOk);

  check('pick 1 is on the clock', state.draft_status === 'in_progress' && state.draft_current_pick === 1);
  check('on_clock is the owner team', state.on_clock?.fantasy_team_id === ownerTeam.id);
}

// --- 2.6 Invite gate: joins closed once the draft starts ---------------------

{
  const late = await signup('late');
  const { error } = await rpc(
    'redeem_invite_code',
    { p_invite_code: inviteCodeLate, p_team_name: 'Too Late' },
    late.token
  );
  check('invite redemption rejected once draft started', !!error, error?.message);
}

// --- 2.3 make_draft_pick rules ----------------------------------------------

// Out-of-turn: B tries to pick while owner is on the clock
{
  const { error } = await rpc(
    'make_draft_pick',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    managerB.token
  );
  check('out-of-turn pick rejected', !!error, error?.message);
}

// Override restricted to the commissioner
{
  const { error } = await rpc(
    'make_draft_pick_for',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    managerB.token
  );
  check('make_draft_pick_for rejected for non-owner', !!error, error?.message);
}

// Pick 1: owner drafts for their own team
{
  const { data, error } = await rpc(
    'make_draft_pick',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    owner.token
  );
  check('owner makes pick 1 for own team', !error && data === true, error?.message);
}

// Duplicate NFL team rejected (B is now on the clock, tries the taken team)
{
  const { error } = await rpc(
    'make_draft_pick',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    managerB.token
  );
  check('duplicate NFL team rejected', !!error, error?.message);
}

// "Your pick!" badge: B is on the clock and get_user_leagues reflects it
{
  const { data: bLeagues } = await rpc('get_user_leagues', {}, managerB.token);
  const bLeague = bLeagues.find((l) => l.id === leagueId);
  check('my_pick badge true for the on-the-clock manager', bLeague?.my_pick === true);

  const { data: oLeagues } = await rpc('get_user_leagues', {}, owner.token);
  const oLeague = oLeagues.find((l) => l.id === leagueId);
  check('my_pick badge false when not on the clock', oLeague?.my_pick === false);
  check('draft_status exposed via get_user_leagues', oLeague?.draft_status === 'in_progress');
}

// --- Complete the draft: B picks for himself, owner covers everything else ---
// get_draft_state runs draft_auto_pick_bots (000026), so unmanaged seats are
// filled on poll. Pick the next untaken NFL team — do not assume a fixed index.

{
  let pickErr = null;
  for (;;) {
    const { data: state } = await rpc('get_draft_state', { p_league_id: leagueId }, owner.token);
    if (state.draft_status !== 'in_progress') break;
    const onClock = state.on_clock;
    if (!onClock) break;
    // Bot already handled inside get_draft_state; re-poll if still on a bot.
    if (onClock.manager_user_id == null) continue;

    const takenIds = new Set(
      (state.picks ?? []).filter((p) => p.nfl_team_id).map((p) => p.nfl_team_id)
    );
    const nflId = nflTeams.find((t) => !takenIds.has(t.uuid_id))?.uuid_id;
    if (!nflId) {
      pickErr = { message: 'No undrafted NFL teams remaining' };
      break;
    }

    const asB = onClock.manager_user_id === managerB.userId;
    const { error } = asB
      ? await rpc('make_draft_pick', { p_league_id: leagueId, p_nfl_team_id: nflId }, managerB.token)
      : onClock.manager_user_id === owner.userId
        ? await rpc('make_draft_pick', { p_league_id: leagueId, p_nfl_team_id: nflId }, owner.token)
        : await rpc('make_draft_pick_for', { p_league_id: leagueId, p_nfl_team_id: nflId }, owner.token);
    if (error) {
      pickErr = error;
      break;
    }
  }
  check('remaining 31 picks complete without error', !pickErr, pickErr?.message);
}

// Post-draft state: complete, 8 rosters of 4 covering all 32 NFL teams
{
  const { data: state } = await rpc('get_draft_state', { p_league_id: leagueId }, owner.token);
  check('draft_status is complete after pick 32', state.draft_status === 'complete');
  check('no pick on the clock after completion', state.draft_current_pick === null && state.on_clock === null);
  check('all 32 picks recorded', state.picks.every((p) => p.nfl_team_id && p.picked_at));

  const { data: rosters } = await rpc('get_league_rosters', { p_league_id: leagueId }, owner.token);
  const perTeam = new Map();
  const nflSeen = new Set();
  for (const r of rosters) {
    perTeam.set(r.fantasy_team_id, (perTeam.get(r.fantasy_team_id) ?? 0) + 1);
    nflSeen.add(r.nfl_team_id);
  }
  check('8 rosters of 4 teams each', perTeam.size === 8 && [...perTeam.values()].every((v) => v === 4));
  check('rosters cover all 32 distinct NFL teams', nflSeen.size === 32);
  check('roster rows record draft pick numbers', rosters.every((r) => r.acquired_via === 'draft' && r.draft_pick_number >= 1));
}

// Picking after completion fails
{
  const { error } = await rpc(
    'make_draft_pick_for',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    owner.token
  );
  check('picks rejected after draft completion', !!error, error?.message);
}

// --- 2.6 Schedule regenerate still allowed after draft (pre-season) ----------

{
  const { data, error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('generate_league_schedule regenerate succeeds after draft', !error && data === true, error?.message);
}

// --- Phase 1 integration: lineups restricted to drafted rosters --------------

{
  const { data: roster } = await rpc('get_team_roster', { p_fantasy_team_id: teamB.id }, managerB.token);
  const myTwo = roster.slice(0, 2).map((r) => r.nfl_team_id);
  const { data, error } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: teamB.id, p_week: 1, p_active_nfl_teams: myTwo },
    managerB.token
  );
  check('lineup of drafted teams accepted', !error && data === true, error?.message);

  const { data: ownerRoster } = await rpc('get_team_roster', { p_fantasy_team_id: ownerTeam.id }, owner.token);
  const notMine = [roster[0].nfl_team_id, ownerRoster[0].nfl_team_id];
  const { error: badErr } = await rpc(
    'set_fantasy_lineup',
    { p_fantasy_team_id: teamB.id, p_week: 1, p_active_nfl_teams: notMine },
    managerB.token
  );
  check('lineup with non-rostered team rejected', !!badErr, badErr?.message);
}

// --- Linear draft format: same round-1 order every round --------------------

{
  const { data: linearLeagueId, error: linearCreateErr } = await rpc(
    'create_league',
    {
      league_name: `Linear Draft Verify ${Date.now()}`,
      season: 2025,
      teams_started_per_week: 2,
      owner_team_name: 'Linear Owner',
      p_draft_format: 'linear',
    },
    owner.token
  );
  check('linear: create_league with draft_format=linear', !linearCreateErr && !!linearLeagueId, linearCreateErr?.message);

  if (linearLeagueId) {
    const { data: details } = await rpc('get_league_details', { league_id: linearLeagueId }, owner.token);
    check('linear: get_league_details exposes draft_format', details?.[0]?.draft_format === 'linear', `got ${details?.[0]?.draft_format}`);

    psql(`
      INSERT INTO fantasy_teams (league_id, team_name)
      SELECT '${linearLeagueId}', x.team_name
      FROM (VALUES
        ('L2'), ('L3'), ('L4'), ('L5'), ('L6'), ('L7'), ('L8')
      ) AS x(team_name);
    `);

    const { data: linearTeams } = await rpc(
      'get_league_fantasy_teams',
      { p_league_id: linearLeagueId },
      owner.token
    );
    const linearOwnerTeam = linearTeams.find((t) => t.manager_user_id === owner.userId);
    const linearOrder = [
      linearOwnerTeam.id,
      ...linearTeams.filter((t) => t.id !== linearOwnerTeam.id).map((t) => t.id),
    ];

    const { data: started, error: startErr } = await rpc(
      'start_draft',
      { p_league_id: linearLeagueId, p_draft_order: linearOrder },
      owner.token
    );
    check('linear: start_draft succeeds', !startErr && started === true, startErr?.message);

    const { data: linearState } = await rpc(
      'get_draft_state',
      { p_league_id: linearLeagueId },
      owner.token
    );
    check('linear: draft_format in get_draft_state', linearState?.draft_format === 'linear', `got ${linearState?.draft_format}`);

    let linearOk = true;
    for (const p of linearState?.picks ?? []) {
      const idxInRound = (p.pick_number - 1) % 8;
      if (p.fantasy_team_id !== linearOrder[idxInRound]) linearOk = false;
    }
    check('linear: picks repeat round-1 order every round (1,9,17,25 for first)', linearOk);
  }
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
