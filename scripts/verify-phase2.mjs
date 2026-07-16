// Phase 2 verification: async snake draft against the self-contained stack
// (docker compose up). Two accounts run a full 32-pick draft; every rule the
// plan lists is exercised: snake order, turn enforcement, duplicate rejection,
// commissioner override, completion -> rosters, "Your pick!" badge data, and
// the schedule/invite gates.
//
// Run: node scripts/verify-phase2.mjs

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

async function signup(label) {
  const email = `verify2-${label}-${Date.now()}@test.local`;
  const res = await api('/auth/signup', { body: { email, password: 'verify-test-password' } });
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

async function createInvite(code) {
  return dbq(
    {
      table: 'league_invitations',
      action: 'insert',
      values: {
        code,
        league_id: leagueId,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        is_active: true,
      },
    },
    owner.token
  );
}

const randomCode = () =>
  Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

const inviteCodeB = randomCode();
{
  const { error } = await createInvite(inviteCodeB);
  check('setup: create invite for manager B', !error, error?.message);
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
  const { error } = await createInvite(inviteCodeLate);
  check('setup: create second invite (for gate test)', !error, error?.message);
}

// Fill to 8 teams (6 more unmanaged teams owned by nobody)
{
  const rows = Array.from({ length: 6 }, (_, i) => ({
    league_id: leagueId,
    team_name: `Team ${i + 3}`,
  }));
  const { error } = await dbq({ table: 'fantasy_teams', action: 'insert', values: rows }, owner.token);
  check('setup: seed 6 additional fantasy teams', !error, error?.message);
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

// Schedule generation blocked before the draft
{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('generate_league_schedule rejected before draft completes', !!error, error?.message);
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

{
  let pickErr = null;
  let taken = 1; // nflTeams[0] used already
  for (;;) {
    const { data: state } = await rpc('get_draft_state', { p_league_id: leagueId }, owner.token);
    if (state.draft_status !== 'in_progress') break;
    const nflId = nflTeams[taken++].uuid_id;
    const onClock = state.on_clock;
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

// --- 2.6 Schedule gate lifts after completion --------------------------------

{
  const { data, error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('generate_league_schedule succeeds after draft completes', !error && data === true, error?.message);
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

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
