// End-to-end verification against the self-contained stack (docker compose up).
// Exercises the same API paths the app client uses: auth, RPC, table queries,
// and photo storage.
//
// Run: node scripts/verify-phase0.mjs

const API = process.env.API_URL || 'http://localhost:3001/api';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function api(path, { method, body, token, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
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

const stamp = Date.now();
const email = `verify-${stamp}@test.local`;
const username = `verify_${stamp}`;
const password = 'verify-test-password';

// 1. Sign up + log in a test user
const signup = await api('/auth/signup', { body: { email, username, password } });
check('auth: sign up test user', !!signup.token && signup.user?.email === email, signup.error?.message ?? email);

const login = await api('/auth/login', { body: { identifier: email, password } });
check('auth: log in with same credentials', !!login.token, login.error?.message);
const token = login.token;

const me = await api('/auth/me', { token });
check('auth: /me returns the signed-in user', me.user?.email === email, me.error?.message);

// 2. Create league (auto-creates owner fantasy team)
const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  token
);
check('create_league', !leagueErr && !!leagueId, leagueErr?.message ?? leagueId);

// 3. Guard: schedule generation must fail with fewer than 8 teams
{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, token);
  check('generate_league_schedule rejects league with < 8 teams', !!error, error?.message);
}

// 4. Fill to 8 fantasy teams (as league owner; unmanaged teams)
{
  const rows = Array.from({ length: 7 }, (_, i) => ({
    league_id: leagueId,
    team_name: `Team ${i + 2}`,
  }));
  const { error } = await dbq({ table: 'fantasy_teams', action: 'insert', values: rows }, token);
  check('seed 7 additional fantasy teams', !error, error?.message);
}

// 4b. Complete a draft (Phase 2 gate: schedule generation requires it).
// The 7 seeded teams are unmanaged, so the owner picks for everyone.
{
  const { error: startErr } = await rpc('start_draft', { p_league_id: leagueId }, token);
  check('start_draft with 8 teams', !startErr, startErr?.message);

  const { data: nflTeams } = await dbq(
    {
      table: 'teams',
      action: 'select',
      select: 'uuid_id, name',
      filters: [{ op: 'eq', column: 'is_nfl', value: true }],
    },
    token
  );
  let pickErr = null;
  for (let i = 0; i < 32 && !pickErr; i++) {
    const { error } = await rpc(
      'make_draft_pick_for',
      { p_league_id: leagueId, p_nfl_team_id: nflTeams[i].uuid_id },
      token
    );
    pickErr = error;
  }
  check('32 commissioner picks complete the draft', !pickErr, pickErr?.message);
}

// 5. Generate schedule and assert invariants
{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, token);
  check('generate_league_schedule succeeds with 8 teams', !error, error?.message);

  const { data: matchups, error: mErr } = await dbq(
    {
      table: 'league_matchups',
      action: 'select',
      select: 'week, fantasy_team1_id, fantasy_team2_id',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
    },
    token
  );
  if (mErr) throw new Error(mErr.message);

  check('72 matchups total', matchups.length === 72, `got ${matchups.length}`);

  const byWeek = new Map();
  for (const m of matchups) {
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week).push(m);
  }
  let weeksOk = true;
  let teamsOncePerWeek = true;
  for (let w = 1; w <= 18; w++) {
    const ms = byWeek.get(w) ?? [];
    if (ms.length !== 4) weeksOk = false;
    const teams = ms.flatMap((m) => [m.fantasy_team1_id, m.fantasy_team2_id]);
    if (new Set(teams).size !== 8) teamsOncePerWeek = false;
  }
  check('every week 1-18 has exactly 4 matchups', weeksOk);
  check('every team appears exactly once per week', teamsOncePerWeek);

  // Full round-robin in weeks 1-7: all 28 unordered pairs meet exactly once
  const pairCounts = new Map();
  for (let w = 1; w <= 7; w++) {
    for (const m of byWeek.get(w) ?? []) {
      const key = [m.fantasy_team1_id, m.fantasy_team2_id].sort().join('|');
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  }
  check(
    'weeks 1-7 form a complete round-robin (28 unique pairings)',
    pairCounts.size === 28 && [...pairCounts.values()].every((v) => v === 1)
  );
}

// 6. Standings view (queried as the signed-in member, like the app does)
{
  const { data, error } = await dbq(
    {
      table: 'v_league_standings',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
      order: [{ column: 'rank' }],
    },
    token
  );
  check('v_league_standings returns 8 rows', !error && data?.length === 8, error?.message ?? `got ${data?.length}`);
  const allZero = (data ?? []).every(
    (r) => r.wins === 0 && r.losses === 0 && r.ties === 0 && r.games_played === 0
  );
  check('all teams 0-0-0 before any scores recorded', allZero);
}

// 7. Week-lock RPCs (same param names as MultiLeagueApi)
{
  const { data, error } = await rpc(
    'set_week_lock',
    { league_id: leagueId, week_number: 1, locks_at: new Date().toISOString(), is_locked: false },
    token
  );
  check('set_week_lock', !error && data === true, error?.message);
}
{
  const { data, error } = await rpc('get_week_status', { league_id: leagueId, week_number: 1 }, token);
  const row = data?.[0];
  check(
    'get_week_status',
    !error && row?.week === 1 && row?.total_teams === 8 && row?.lineups_submitted === 0,
    error?.message ?? JSON.stringify(row)
  );
}
{
  const { data, error } = await rpc(
    'toggle_week_lock',
    { p_league_id: leagueId, p_week_number: 1, p_lock_state: true },
    token
  );
  check('toggle_week_lock', !error && data === true, error?.message);
  const { data: status } = await rpc('get_week_status', { league_id: leagueId, week_number: 1 }, token);
  check('week 1 reports locked after toggle', status?.[0]?.is_locked === true);
}

// 8. Invitation list join (the getLeagueInvitations embed)
{
  const { error: insErr } = await dbq(
    {
      table: 'league_invitations',
      action: 'insert',
      values: {
        // unique per run: the code column is globally unique across leagues
        code: `V${Date.now().toString(36).toUpperCase()}`.slice(0, 8),
        league_id: leagueId,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        is_active: true,
      },
    },
    token
  );
  check('insert invitation as owner', !insErr, insErr?.message);

  const { data, error } = await dbq(
    {
      table: 'league_invitations',
      action: 'select',
      select: 'code, league_id, expires_at, is_active, used_at, used_by_user_id, leagues!inner(name)',
      filters: [
        { op: 'eq', column: 'league_id', value: leagueId },
        { op: 'eq', column: 'is_active', value: true },
      ],
    },
    token
  );
  const name = data?.[0]?.leagues?.name;
  check('invitations select joins league name', !error && !!name, error?.message ?? `league_name=${name}`);
}

// 9. Photo upload / serve / delete
{
  // 1x1 transparent PNG
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  const formData = new FormData();
  formData.append('file', new Blob([pngBytes], { type: 'image/png' }), 'profile.png');
  const uploaded = await api('/photos', { method: 'POST', formData, token });
  check('photo upload', !!uploaded.url, uploaded.error?.message ?? uploaded.url);

  if (uploaded.url) {
    const base = API.replace(/\/api\/?$/, '');
    const served = await fetch(`${base}${uploaded.url}`);
    check('photo served statically', served.status === 200, `HTTP ${served.status}`);
  }

  const deleted = await api('/photos', { method: 'DELETE', token });
  check('photo delete', deleted.success === true, deleted.error?.message);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
