// Live-draft reliability verification (autostart, pick-clock expiry,
// pause/resume, bot auto-pick) against the self-contained stack
// (docker compose up).
//
// The whole point: every assertion here proves the server-side ticker
// (draft_tick_all, called every 5s from server/src/email.ts with no request
// context) advances a live draft on its own. This script NEVER calls
// get_draft_state — that RPC runs the same tick helpers as a side effect,
// which would mask whether draft_tick_all alone is sufficient. All state
// reads go through psql (superuser) or the generic /api/db/query endpoint,
// never through get_draft_state.
//
// Timing is controlled explicitly (UPDATE ... draft_pick_deadline = NOW() -
// INTERVAL '1 second') instead of sleeping, so the run is fast and
// non-flaky regardless of draft_pick_seconds.
//
// Run: node scripts/verify-live-draft.mjs

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
  // The many back-to-back `docker compose exec` subprocesses this script
  // spawns (for psql reads/writes) occasionally coincide with a transient
  // ECONNRESET on the host->container port-forward; retry a couple of times
  // before giving up, same as any flaky-network test harness would.
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
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
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr;
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });
const dbq = (query, token) => api('/db/query', { body: query, token });

/**
 * Run SQL as postgres superuser (bypasses RLS + REVOKEs, same privilege
 * level as the real ticker's adminPool). Pass `capture: true` to get rows
 * back as string[][] (psql -t -A -F"|", no header/footer noise).
 */
function psql(sql, { capture = false } = {}) {
  const out = execSync(
    'docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -t -A -F"|" -f -',
    {
      input: sql,
      stdio: ['pipe', capture ? 'pipe' : 'ignore', 'inherit'],
      encoding: capture ? 'utf8' : undefined,
    }
  );
  if (!capture) return null;
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'));
}

/** The one and only trigger under test: the server's 5s ticker, run once. */
function tickOnce() {
  psql('SELECT draft_tick_all();');
}

function leagueRow(leagueId) {
  // Note: bare boolean columns/expressions render as t/f via psql; an
  // explicit ::text CAST renders true/false instead — no ::text here.
  const [row] = psql(
    `SELECT draft_status, draft_current_pick, draft_paused, draft_pick_deadline, (draft_pick_deadline > NOW()) FROM leagues WHERE id = '${leagueId}';`,
    { capture: true }
  );
  const [draft_status, draft_current_pick, draft_paused, draft_pick_deadline, deadline_future] = row;
  return {
    draft_status,
    draft_current_pick: draft_current_pick === '' ? null : Number(draft_current_pick),
    draft_paused: draft_paused === 't',
    draft_pick_deadline: draft_pick_deadline === '' ? null : draft_pick_deadline,
    deadline_future: deadline_future === 't',
  };
}

function pickRow(leagueId, pickNumber) {
  const [row] = psql(
    `SELECT dp.fantasy_team_id, dp.nfl_team_id, dp.is_auto, t.name
     FROM draft_picks dp LEFT JOIN teams t ON t.uuid_id = dp.nfl_team_id
     WHERE dp.league_id = '${leagueId}' AND dp.pick_number = ${pickNumber};`,
    { capture: true }
  );
  const [fantasy_team_id, nfl_team_id, is_auto, nfl_team_name] = row;
  return {
    fantasy_team_id,
    nfl_team_id: nfl_team_id || null,
    is_auto: is_auto === 't',
    nfl_team_name: nfl_team_name || null,
  };
}

function forceDeadlinePast(leagueId) {
  psql(`UPDATE leagues SET draft_pick_deadline = NOW() - INTERVAL '1 second' WHERE id = '${leagueId}';`);
}

async function signup(label) {
  const email = `verifylive-${label}-${Date.now()}@test.local`;
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

// --- Shared: 32 NFL teams, alphabetical -------------------------------------

const bootstrap = await signup('bootstrap');
const { data: nflTeams } = await dbq(
  {
    table: 'teams',
    action: 'select',
    select: 'uuid_id, name',
    filters: [{ op: 'eq', column: 'is_nfl', value: true }],
    order: [{ column: 'name' }],
  },
  bootstrap.token
);
check('setup: exactly 32 NFL teams available', nflTeams.length === 32, `got ${nflTeams.length}`);

// =============================================================================
// LIVE DRAFT: autostart -> timeout expiry -> pause -> resume -> commissioner
// override. Every advance below is driven by tickOnce() alone; get_draft_state
// is never called anywhere in this section.
// =============================================================================

const owner = await signup('owner');

// draft_at already in the past: draft_status stays 'pending' until something
// ticks it — proves autostart doesn't happen "for free" on creation.
const draftAt = new Date(Date.now() - 5_000).toISOString();
const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Live Draft Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 1,
    owner_team_name: 'Owner Team',
    p_draft_mode: 'live',
    p_draft_at: draftAt,
    p_draft_pick_seconds: 30,
  },
  owner.token
);
check('setup: create live-mode league (draft_at in the past)', !leagueErr && !!leagueId, leagueErr?.message);

{
  const { error } = await rpc('fill_draft_bots', { p_league_id: leagueId }, owner.token);
  check('setup: fill_draft_bots brings league to 8 teams', !error, error?.message);
}

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
check('setup: 8 fantasy teams present', fantasyTeams.length === 8, `got ${fantasyTeams.length}`);
const ownerTeam = fantasyTeams.find((t) => t.manager_user_id === owner.userId);
const bots = fantasyTeams.filter((t) => t.id !== ownerTeam.id);

{
  // Owner explicitly first so the on-clock team is deterministic (a human,
  // not a bot) at every round-1/round-3 start (picks 1 and 17).
  const order = [ownerTeam.id, ...bots.map((t) => t.id)];
  const { error } = await rpc('set_draft_order', { p_league_id: leagueId, p_draft_order: order }, owner.token);
  check('setup: set_draft_order (owner first)', !error, error?.message);
}

{
  // Not asserted: the *real* server ticker (setInterval every 5s in
  // server/src/email.ts) is also running against this same compose stack
  // and can legitimately autostart this league itself before our own
  // explicit tickOnce() below runs, since draft_at is already in the past.
  // That's not a bug — it's the exact behavior under test — so we only log
  // it rather than assert 'pending' here.
  const state = leagueRow(leagueId);
  console.log(`  (info) draft_status before our own tick: ${state.draft_status}`);
}

// --- AC1: autostart via the ticker alone, no client ever polled -------------

tickOnce();
{
  const state = leagueRow(leagueId);
  check('AC1: draft_status autostarted to in_progress', state.draft_status === 'in_progress', state.draft_status);
  check('AC1: draft_current_pick is 1', state.draft_current_pick === 1, String(state.draft_current_pick));
  check('AC1: draft_pick_deadline set in the future', state.deadline_future, state.draft_pick_deadline);

  const pick1 = pickRow(leagueId, 1);
  check('AC1: pick 1 is on the clock for the owner (human, per draft_order)', pick1.fantasy_team_id === ownerTeam.id);
}

// --- AC2 + AC5: owner (human) misses the clock; timeout auto-picks pick 1,
// then bots cascade through picks 2-15 with zero polling, stopping exactly
// at pick 16 (owner's next turn, round 2 reverse-order finish). -------------

forceDeadlinePast(leagueId);
tickOnce();

{
  const pick1 = pickRow(leagueId, 1);
  check('AC2: timeout auto-picked pick 1', !!pick1.nfl_team_id && pick1.is_auto);
  check('AC2: timeout pick is the alphabetically-first NFL team', pick1.nfl_team_id === nflTeams[0].uuid_id, pick1.nfl_team_name);

  const state = leagueRow(leagueId);
  check('AC5: bot cascade advanced to pick 16 (owner up again) in one tick', state.draft_current_pick === 16, String(state.draft_current_pick));

  // Picks 2-15 (all bots) should be auto-filled, and — since each auto-pick
  // takes the alphabetically-smallest remaining team — strictly increasing
  // by name in pick order.
  let allAuto = true;
  let strictlyIncreasing = true;
  let prevName = pickRow(leagueId, 1).nfl_team_name;
  for (let pickNum = 2; pickNum <= 15; pickNum++) {
    const p = pickRow(leagueId, pickNum);
    if (!p.nfl_team_id || !p.is_auto) allAuto = false;
    if (p.nfl_team_name <= prevName) strictlyIncreasing = false;
    prevName = p.nfl_team_name;
  }
  check('AC5: picks 2-15 auto-filled for unmanaged bot teams, no polling', allAuto);
  check('AC5: bot auto-picks stay alphabetically ascending (smallest-remaining rule)', strictlyIncreasing);

  const pick16 = pickRow(leagueId, 16);
  check('AC2/AC5: cascade stopped at pick 16 for the human owner (not auto-picked)', pick16.fantasy_team_id === ownerTeam.id && !pick16.nfl_team_id);
}

// --- AC3: pause freezes the clock, even against a forced stale deadline ----

{
  const { error } = await rpc('pause_draft', { p_league_id: leagueId }, owner.token);
  check('AC3: pause_draft succeeds for the owner', !error, error?.message);
}
{
  const state = leagueRow(leagueId);
  check('AC3: draft_paused is true', state.draft_paused);
  check('AC3: draft_pick_deadline cleared on pause', state.draft_pick_deadline === null);
}
// Defense in depth: force a stale deadline in directly (this shouldn't be
// reachable through the API, since pause always nulls it) and confirm the
// `league_paused` guard blocks expiry independent of the deadline value.
psql(`UPDATE leagues SET draft_pick_deadline = NOW() - INTERVAL '1 hour' WHERE id = '${leagueId}';`);
tickOnce();
{
  const state = leagueRow(leagueId);
  check('AC3: tick while paused does not advance the pick', state.draft_current_pick === 16, String(state.draft_current_pick));
  check('AC3: tick while paused leaves draft_paused true', state.draft_paused);
  const pick16 = pickRow(leagueId, 16);
  check('AC3: pick 16 still unfilled while paused', !pick16.nfl_team_id);
}

// --- AC4: resume unfreezes the clock; a subsequent expiry fires normally --

{
  const { error } = await rpc('resume_draft', { p_league_id: leagueId }, owner.token);
  check('AC4: resume_draft succeeds for the owner', !error, error?.message);
}
{
  const state = leagueRow(leagueId);
  check('AC4: draft_paused is false after resume', !state.draft_paused);
  check('AC4: draft_pick_deadline reset into the future on resume', state.deadline_future, state.draft_pick_deadline);
}
forceDeadlinePast(leagueId);
tickOnce();
{
  const pick16 = pickRow(leagueId, 16);
  check('AC4: post-resume timeout auto-picked pick 16', !!pick16.nfl_team_id && pick16.is_auto);

  const state = leagueRow(leagueId);
  // Pick 17 (round 3, forward order) is the owner again — cascade stops there.
  check('AC4: clock advanced to pick 17 (owner up again) after resume', state.draft_current_pick === 17, String(state.draft_current_pick));
  check('AC4: new deadline set for pick 17', state.deadline_future);
}

// --- AC7 (live): commissioner override still works when someone stalls ----

{
  const takenIds = new Set();
  for (let pickNum = 1; pickNum <= 16; pickNum++) {
    const p = pickRow(leagueId, pickNum);
    if (p.nfl_team_id) takenIds.add(p.nfl_team_id);
  }
  const nextTeam = nflTeams.find((t) => !takenIds.has(t.uuid_id));

  const { data, error } = await rpc(
    'make_draft_pick_for',
    { p_league_id: leagueId, p_nfl_team_id: nextTeam.uuid_id },
    owner.token
  );
  check('AC7: commissioner override (make_draft_pick_for) succeeds mid-live-draft', !error && data === true, error?.message);

  const pick17 = pickRow(leagueId, 17);
  check('AC7: override pick recorded as manual (is_auto=false)', pick17.is_auto === false);

  const [auditRow] = psql(
    `SELECT (details->>'is_commissioner_override') FROM audit_logs
     WHERE league_id = '${leagueId}' AND action = 'PICK' AND entity_type = 'draft_pick'
     ORDER BY created_at DESC LIMIT 1;`,
    { capture: true }
  );
  check('AC7: audit log marks the pick as a commissioner override', auditRow?.[0] === 'true');
}

// =============================================================================
// ASYNC DRAFT: bots still advance on tick, but no deadline is ever set.
// =============================================================================

const owner2 = await signup('owner-async');

const { data: asyncLeagueId, error: asyncLeagueErr } = await rpc(
  'create_league',
  {
    league_name: `Async Draft Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 1,
    owner_team_name: 'Owner Team',
    // p_draft_mode omitted -> defaults to 'async'
  },
  owner2.token
);
check('setup: create async-mode league', !asyncLeagueErr && !!asyncLeagueId, asyncLeagueErr?.message);

{
  const { error } = await rpc('fill_draft_bots', { p_league_id: asyncLeagueId }, owner2.token);
  check('setup: fill_draft_bots (async league) brings it to 8 teams', !error, error?.message);
}

const { data: asyncTeams } = await rpc('get_league_fantasy_teams', { p_league_id: asyncLeagueId }, owner2.token);
const ownerTeam2 = asyncTeams.find((t) => t.manager_user_id === owner2.userId);
const bots2 = asyncTeams.filter((t) => t.id !== ownerTeam2.id);

{
  const order = [ownerTeam2.id, ...bots2.map((t) => t.id)];
  const { error } = await rpc('start_draft', { p_league_id: asyncLeagueId, p_draft_order: order }, owner2.token);
  check('setup: start_draft (async, explicit order, owner first)', !error, error?.message);
}

{
  const state = leagueRow(asyncLeagueId);
  check('AC6: async draft has no deadline right after start', state.draft_pick_deadline === null);
}

// --- AC7 (async): commissioner override on an untouched pick 1 ------------

{
  const nextTeam = nflTeams[0]; // fresh league, nothing drafted yet
  const { data, error } = await rpc(
    'make_draft_pick_for',
    { p_league_id: asyncLeagueId, p_nfl_team_id: nextTeam.uuid_id },
    owner2.token
  );
  check('AC7: commissioner override succeeds in an async draft', !error && data === true, error?.message);
}

// --- AC6: repeated ticks advance bots but never introduce a deadline ------

for (let i = 0; i < 3; i++) tickOnce();
{
  const state = leagueRow(asyncLeagueId);
  check('AC6: async draft_pick_deadline still NULL after repeated ticks (no deadline spam)', state.draft_pick_deadline === null);
  check('AC6: async draft advanced past pick 1 via bot auto-pick on tick', state.draft_current_pick > 1, String(state.draft_current_pick));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
