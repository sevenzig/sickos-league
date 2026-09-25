// Offline draft: commissioner assigns all 32 NFL teams in one step.
// Run: node scripts/verify-offline-draft.mjs

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

function leagueRow(leagueId) {
  const [row] = psql(
    `SELECT draft_status, draft_current_pick, draft_pick_deadline, draft_mode,
            (SELECT COUNT(*) FROM draft_picks WHERE league_id = '${leagueId}')
     FROM leagues WHERE id = '${leagueId}';`,
    { capture: true }
  );
  const [draft_status, draft_current_pick, draft_pick_deadline, draft_mode, pick_count] = row;
  return {
    draft_status,
    draft_current_pick: draft_current_pick === '' ? null : Number(draft_current_pick),
    draft_pick_deadline: draft_pick_deadline === '' ? null : draft_pick_deadline,
    draft_mode,
    pick_count: Number(pick_count),
  };
}

function slotTeam(leagueId, pickNumber) {
  const [row] = psql(
    `SELECT fantasy_team_id FROM draft_picks
     WHERE league_id = '${leagueId}' AND pick_number = ${pickNumber};`,
    { capture: true }
  );
  return row?.[0] || null;
}

async function signup(label) {
  const email = `verifyoffline-${label}-${Date.now()}@test.local`;
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

const owner = await signup('owner');
const outsider = await signup('outsider');

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Offline Draft Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 1,
    owner_team_name: 'Owner Team',
    p_draft_mode: 'offline',
    p_draft_at: new Date().toISOString(),
    p_draft_format: 'snake',
  },
  owner.token
);
check('setup: create offline league', !leagueErr && !!leagueId, leagueErr?.message);

{
  const [row] = psql(
    `SELECT draft_mode, draft_at IS NULL FROM leagues WHERE id = '${leagueId}';`,
    { capture: true }
  );
  check('setup: offline stores no scheduled time', row?.[0] === 'offline' && row?.[1] === 't', row?.join('|'));
}

{
  const { error } = await rpc('start_offline_draft', { p_league_id: leagueId, p_draft_order: null }, owner.token);
  check('start with fewer than 8 teams fails', !!error, error?.message);
}

{
  const { error } = await rpc('fill_draft_bots', { p_league_id: leagueId }, owner.token);
  check('setup: fill_draft_bots brings league to 8 teams', !error, error?.message);
}

const { data: fantasyTeams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
check('setup: 8 fantasy teams present', fantasyTeams.length === 8, `got ${fantasyTeams.length}`);
const ownerTeam = fantasyTeams.find((t) => t.manager_user_id === owner.userId);
const bots = fantasyTeams.filter((t) => t.id !== ownerTeam.id);
const order = [ownerTeam.id, ...bots.map((t) => t.id)];

{
  const { error } = await rpc('start_offline_draft', { p_league_id: leagueId }, owner.token);
  check('start without a saved order fails', !!error, error?.message);
}

{
  const { error } = await rpc('start_draft', { p_league_id: leagueId, p_draft_order: order }, owner.token);
  check('start_draft rejects offline mode', !!error, error?.message);
}

{
  const { data, error } = await rpc(
    'start_offline_draft',
    { p_league_id: leagueId, p_draft_order: order },
    owner.token
  );
  check('start offline draft succeeds', !error && data === true, error?.message);
}

{
  const state = leagueRow(leagueId);
  check('start: status in_progress', state.draft_status === 'in_progress', state.draft_status);
  check('start: 32 pick slots', state.pick_count === 32, String(state.pick_count));
  check('start: no current pick', state.draft_current_pick === null, String(state.draft_current_pick));
  check('start: no pick deadline', state.draft_pick_deadline === null);
  check('snake: pick 1 is first in order', slotTeam(leagueId, 1) === order[0]);
  check('snake: pick 9 (even round) is last in order', slotTeam(leagueId, 9) === order[7]);
}

psql(`UPDATE leagues SET join_password_hash = 'test-hash' WHERE id = '${leagueId}';`);
{
  let message = '';
  try {
    psql(`
      DO $$
      BEGIN
        PERFORM set_config('app.user_id', '${outsider.userId}', true);
        PERFORM join_league('${leagueId}'::uuid, 'Late Team');
        RAISE EXCEPTION 'join should have failed';
      EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%draft has started%' THEN
          RAISE;
        END IF;
      END $$;
    `);
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
  }
  check('join_league fails after start', message === '', message.slice(0, 200));
}

{
  const { error } = await rpc(
    'make_draft_pick',
    { p_league_id: leagueId, p_nfl_team_id: nflTeams[0].uuid_id },
    owner.token
  );
  check('make_draft_pick fails for offline', !!error, error?.message);
}

psql('SELECT draft_tick_all();');
{
  const state = leagueRow(leagueId);
  const [filled] = psql(
    `SELECT COUNT(*) FROM draft_picks WHERE league_id = '${leagueId}' AND nfl_team_id IS NOT NULL;`,
    { capture: true }
  );
  check('tick does not fill offline picks', filled?.[0] === '0', filled?.[0]);
  check('tick does not set a deadline', state.draft_pick_deadline === null);
  check('tick leaves status in_progress', state.draft_status === 'in_progress', state.draft_status);
}

const fullBoard = nflTeams.map((team, i) => ({
  pick_number: i + 1,
  nfl_team_id: team.uuid_id,
}));
// node-pg sends JS arrays as Postgres arrays, which are not valid jsonb.
const asJson = (picks) => JSON.stringify(picks);

{
  const { error } = await rpc(
    'set_offline_draft_picks',
    { p_league_id: leagueId, p_picks: asJson(fullBoard.slice(0, 31)) },
    owner.token
  );
  check('finalize rejects a short board', !!error && !/invalid input syntax/.test(error.message), error?.message);
}

{
  const duplicate = fullBoard.map((pick) => ({ ...pick }));
  duplicate[31] = { pick_number: 32, nfl_team_id: duplicate[0].nfl_team_id };
  const { error } = await rpc(
    'set_offline_draft_picks',
    { p_league_id: leagueId, p_picks: asJson(duplicate) },
    owner.token
  );
  check('finalize rejects a duplicate NFL team', !!error && !/invalid input syntax/.test(error.message), error?.message);
}

{
  const { error } = await rpc(
    'set_offline_draft_picks',
    { p_league_id: leagueId, p_picks: asJson(fullBoard) },
    outsider.token
  );
  check('non-owner cannot finalize', !!error && !/invalid input syntax/.test(error.message), error?.message);
}

{
  const { data, error } = await rpc(
    'set_offline_draft_picks',
    { p_league_id: leagueId, p_picks: asJson(fullBoard) },
    owner.token
  );
  check('finalize succeeds', !error && data === true, error?.message);
}

{
  const state = leagueRow(leagueId);
  check('finalize: status complete', state.draft_status === 'complete', state.draft_status);

  const [roster] = psql(
    `SELECT COUNT(*),
            COUNT(DISTINCT nfl_team_id),
            COUNT(DISTINCT fantasy_team_id),
            COUNT(*) FILTER (WHERE acquired_via = 'commissioner'),
            COUNT(*) FILTER (WHERE draft_pick_number IS NOT NULL)
     FROM fantasy_team_rosters WHERE league_id = '${leagueId}';`,
    { capture: true }
  );
  check('finalize: 32 roster rows', roster?.[0] === '32', roster?.[0]);
  check('finalize: 32 distinct NFL teams', roster?.[1] === '32', roster?.[1]);
  check('finalize: 8 fantasy teams', roster?.[2] === '8', roster?.[2]);
  check('finalize: acquired_via commissioner', roster?.[3] === '32', roster?.[3]);
  check('finalize: draft_pick_number set', roster?.[4] === '32', roster?.[4]);

  const [perTeam] = psql(
    `SELECT COUNT(*) FROM (
       SELECT fantasy_team_id FROM fantasy_team_rosters
       WHERE league_id = '${leagueId}'
       GROUP BY fantasy_team_id
       HAVING COUNT(*) = 4
     ) t;`,
    { capture: true }
  );
  check('finalize: each fantasy team has 4', perTeam?.[0] === '8', perTeam?.[0]);
}

{
  const { error } = await rpc(
    'set_offline_draft_picks',
    { p_league_id: leagueId, p_picks: asJson(fullBoard) },
    owner.token
  );
  check('second finalize fails', !!error, error?.message);
}

// Linear: even-round slot 9 stays with the first team in order.
{
  const { data: linearId, error } = await rpc(
    'create_league',
    {
      league_name: `Offline Linear ${Date.now()}`,
      season: 2025,
      teams_started_per_week: 1,
      owner_team_name: 'Linear Owner',
      p_draft_mode: 'offline',
      p_draft_format: 'linear',
    },
    owner.token
  );
  check('setup: create linear offline league', !error && !!linearId, error?.message);
  if (linearId) {
    const fill = await rpc('fill_draft_bots', { p_league_id: linearId }, owner.token);
    const teams = await rpc('get_league_fantasy_teams', { p_league_id: linearId }, owner.token);
    const linearOwner = teams.data.find((t) => t.manager_user_id === owner.userId);
    const linearOrder = [linearOwner.id, ...teams.data.filter((t) => t.id !== linearOwner.id).map((t) => t.id)];
    const started = await rpc(
      'start_offline_draft',
      { p_league_id: linearId, p_draft_order: linearOrder },
      owner.token
    );
    check('linear start succeeds', !fill.error && !started.error, started.error?.message || fill.error?.message);
    check('linear: pick 9 stays with first in order', slotTeam(linearId, 9) === linearOrder[0]);
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll offline draft checks passed');
