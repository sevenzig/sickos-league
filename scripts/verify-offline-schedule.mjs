// Offline manual schedule: 7-week template + mid-season rewrite.
// Run: node scripts/verify-offline-schedule.mjs

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
    json = { error: { message: `Non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}` } };
  }
  return { status: res.status, ...json };
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });

function psql(sql) {
  const out = execSync(
    'docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -t -A -F"|" -f -',
    { input: sql, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split('|'));
}

async function signup(label) {
  const email = `verifyoffsched-${label}-${Date.now()}@test.local`;
  const res = await api('/auth/signup', {
    body: {
      email,
      username: email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32),
      password: 'verify-test-password',
    },
  });
  if (!res.token) throw new Error(`signup failed: ${res.error?.message}`);
  return { token: res.token, userId: res.user.id };
}

function matchups(leagueId) {
  return psql(
    `SELECT week, fantasy_team1_id, fantasy_team2_id, is_playoff, is_complete
     FROM league_matchups WHERE league_id = '${leagueId}'
     ORDER BY week, fantasy_team1_id;`
  ).map(([week, t1, t2, isPlayoff, isComplete]) => ({
    week: Number(week),
    t1,
    t2,
    isPlayoff: isPlayoff === 't',
    isComplete: isComplete === 't',
  }));
}

/** Seven weeks of circle-method pairings (same as weeks 1–7 of randomize). */
function template7(teamIds) {
  const games = [];
  for (let week = 1; week <= 7; week++) {
    const round = week - 1;
    for (let k = 0; k < 4; k++) {
      let a;
      let b;
      if (k === 0) {
        a = teamIds[round];
        b = teamIds[7];
      } else {
        a = teamIds[(round + k) % 7];
        b = teamIds[(round - k + 7) % 7];
      }
      games.push({ week, fantasy_team1_id: a, fantasy_team2_id: b });
    }
  }
  return games;
}

function flippedOf(template) {
  return template.map((g) => ({
    week: g.week + 7,
    fantasy_team1_id: g.fantasy_team2_id,
    fantasy_team2_id: g.fantasy_team1_id,
  }));
}

console.log('--- Offline manual schedule ---');

const owner = await signup('owner');

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Offline Schedule Verify ${Date.now()}`,
    season: 2026,
    teams_started_per_week: 1,
    owner_team_name: 'Owner Team',
    p_draft_mode: 'offline',
    p_draft_format: 'snake',
  },
  owner.token
);
check('setup: create offline league', !leagueErr && !!leagueId, leagueErr?.message);

{
  const { error } = await rpc('fill_draft_bots', { p_league_id: leagueId }, owner.token);
  check('setup: 8 teams', !error, error?.message);
}

const teams = psql(
  `SELECT id FROM fantasy_teams WHERE league_id = '${leagueId}' ORDER BY team_name;`
).map((r) => r[0]);
check('setup: 8 team ids', teams.length === 8, String(teams.length));

const order = teams;

{
  const { error } = await rpc(
    'start_offline_draft',
    { p_league_id: leagueId, p_draft_order: order },
    owner.token
  );
  check('start_offline_draft succeeds', !error, error?.message);
}

{
  const rows = matchups(leagueId);
  check('start leaves league_matchups empty', rows.length === 0, String(rows.length));
}

{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check(
    'generate_league_schedule rejects offline',
    !!error && /offline|manual/i.test(error.message),
    error?.message
  );
}

const tmpl = template7(teams);
{
  const short = tmpl.slice(0, 27);
  const { error } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(short) },
    owner.token
  );
  check(
    'offline set rejects not-28',
    !!error && /28 matchups/.test(error.message),
    error?.message
  );
}

{
  const { error } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(tmpl) },
    owner.token
  );
  check('offline set accepts 28-game template', !error, error?.message);
}

{
  const rows = matchups(leagueId);
  const regular = rows.filter((r) => !r.isPlayoff);
  check('after save: 56 regular games', regular.length === 56, String(regular.length));
  check('after save: no playoff rows', rows.every((r) => !r.isPlayoff));

  const expectedFlip = flippedOf(tmpl);
  let flipOk = true;
  for (const exp of expectedFlip) {
    const found = regular.some(
      (r) =>
        r.week === exp.week &&
        r.t1 === exp.fantasy_team1_id &&
        r.t2 === exp.fantasy_team2_id
    );
    if (!found) flipOk = false;
  }
  check('weeks 8–14 are flipped copies of 1–7', flipOk);

  let weeks17Ok = true;
  for (const g of tmpl) {
    const found = regular.some(
      (r) => r.week === g.week && r.t1 === g.fantasy_team1_id && r.t2 === g.fantasy_team2_id
    );
    if (!found) weeks17Ok = false;
  }
  check('weeks 1–7 match template', weeks17Ok);
}

// Mid-season override: lock week 1, complete a matchup, save again
psql(`UPDATE weeks SET is_locked = true WHERE league_id = '${leagueId}' AND week_number = 1;`);
{
  const first = matchups(leagueId).find((r) => r.week === 1);
  if (first) {
    psql(
      `UPDATE league_matchups SET is_complete = true, team1_score = 10, team2_score = 5
       WHERE league_id = '${leagueId}' AND week = 1
         AND fantasy_team1_id = '${first.t1}' AND fantasy_team2_id = '${first.t2}';`
    );
  }
}

const altOrder = [...teams].reverse();
const altTmpl = template7(altOrder);

{
  const { error } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(altTmpl) },
    owner.token
  );
  check('offline set succeeds after lock + completed score', !error, error?.message);
}

{
  const rows = matchups(leagueId);
  const regular = rows.filter((r) => !r.isPlayoff);
  check('rewrite: still 56 regular games', regular.length === 56, String(regular.length));
  const completed = regular.filter((r) => r.isComplete);
  check('rewrite: prior completed scores gone', completed.length === 0, String(completed.length));

  const expectedFlip = flippedOf(altTmpl);
  let flipOk = true;
  for (const exp of expectedFlip) {
    const found = regular.some(
      (r) =>
        r.week === exp.week &&
        r.t1 === exp.fantasy_team1_id &&
        r.t2 === exp.fantasy_team2_id
    );
    if (!found) flipOk = false;
  }
  check('rewrite: weeks 8–14 match new flipped template', flipOk);
}

// Playoff rows must survive a rewrite
psql(`
  INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
  VALUES ('${leagueId}', 15, '${teams[0]}', '${teams[1]}', true);
`);

{
  const { error } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(tmpl) },
    owner.token
  );
  check('offline set with playoff row present succeeds', !error, error?.message);
  const playoffs = matchups(leagueId).filter((r) => r.isPlayoff);
  check('playoff rows untouched after rewrite', playoffs.length === 1, String(playoffs.length));
  check(
    'playoff row still week 15',
    playoffs[0]?.week === 15 && playoffs[0]?.t1 === teams[0] && playoffs[0]?.t2 === teams[1]
  );
  const regular = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('regular season still 56 after rewrite with playoffs', regular.length === 56, String(regular.length));
}

// RS=15 offline expand: week 15 ≡ week 1
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}';`);
  const { error: set15 } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 15,
    },
    owner.token
  );
  check('offline RS=15: settings', !set15, set15?.message);

  const { error: save15 } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(tmpl) },
    owner.token
  );
  check('offline RS=15: save template', !save15, save15?.message);

  const regular = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('offline RS=15: 60 games', regular.length === 60, String(regular.length));
  let week15Ok = true;
  for (const g of tmpl.filter((x) => x.week === 1)) {
    const found = regular.some(
      (r) => r.week === 15 && r.t1 === g.fantasy_team1_id && r.t2 === g.fantasy_team2_id
    );
    if (!found) week15Ok = false;
  }
  check('offline RS=15: week 15 ≡ week 1 (same sides)', week15Ok);

  psql(`
    INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff)
    VALUES ('${leagueId}', 16, '${teams[0]}', '${teams[1]}', true);
  `);
  const { error: rewrite15 } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(tmpl) },
    owner.token
  );
  check('offline RS=15: rewrite with playoff stub', !rewrite15, rewrite15?.message);
  const playoffs = matchups(leagueId).filter((r) => r.isPlayoff);
  check('offline RS=15: playoff stub untouched', playoffs.length === 1 && playoffs[0]?.week === 16);
  check(
    'offline RS=15: still 60 RS after rewrite',
    matchups(leagueId).filter((r) => !r.isPlayoff).length === 60
  );
}

// RS=16 offline expand: week 16 ≡ week 2
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}';`);
  const { error: set16 } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 16,
    },
    owner.token
  );
  check('offline RS=16: settings', !set16, set16?.message);

  const { error: save16 } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(tmpl) },
    owner.token
  );
  check('offline RS=16: save template', !save16, save16?.message);

  const regular = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('offline RS=16: 64 games', regular.length === 64, String(regular.length));
  let week16Ok = true;
  for (const g of tmpl.filter((x) => x.week === 2)) {
    const found = regular.some(
      (r) => r.week === 16 && r.t1 === g.fantasy_team1_id && r.t2 === g.fantasy_team2_id
    );
    if (!found) week16Ok = false;
  }
  check('offline RS=16: week 16 ≡ week 2 (same sides)', week16Ok);
}

console.log(`\n${failures === 0 ? 'All checks passed' : `${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
