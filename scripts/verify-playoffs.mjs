// 14-week season and playoff brackets.
// Run: node scripts/verify-playoffs.mjs

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
  const email = `verifyplayoff-${label}-${Date.now()}@test.local`;
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
    `SELECT week, fantasy_team1_id, fantasy_team2_id, is_playoff, is_complete,
            team1_score::text, team2_score::text
     FROM league_matchups WHERE league_id = '${leagueId}'
     ORDER BY week, fantasy_team1_id;`
  ).map(([week, t1, t2, isPlayoff, isComplete, s1, s2]) => ({
    week: Number(week),
    t1,
    t2,
    isPlayoff: isPlayoff === 't',
    isComplete: isComplete === 't',
    s1,
    s2,
  }));
}

function seedByPoints(leagueId) {
  const rows = psql(
    `SELECT fantasy_team_id FROM v_league_standings
     WHERE league_id = '${leagueId}' ORDER BY rank;`
  );
  return rows.map((r) => r[0]);
}

const owner = await signup('owner');
const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Playoff Verify ${Date.now()}`,
    season: 2025,
    teams_started_per_week: 1,
    owner_team_name: 'Owner Team',
    p_draft_mode: 'async',
    p_playoff_teams: 8,
    p_standings_tiebreaker: 'record_then_points',
  },
  owner.token
);
check('setup: create league', !leagueErr && !!leagueId, leagueErr?.message);

{
  const { error } = await rpc('fill_draft_bots', { p_league_id: leagueId }, owner.token);
  check('setup: 8 teams', !error, error?.message);
}

{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('randomize succeeds', !error, error?.message);
  const rows = matchups(leagueId);
  const regular = rows.filter((r) => !r.isPlayoff);
  check('randomize: 56 games', regular.length === 56, String(regular.length));
  check('randomize: weeks 1-14 only', regular.every((r) => r.week >= 1 && r.week <= 14) && !rows.some((r) => r.week > 14));
  let weeksOk = true;
  for (let week = 1; week <= 14; week++) {
    const games = regular.filter((r) => r.week === week);
    const ids = new Set(games.flatMap((g) => [g.t1, g.t2]));
    if (games.length !== 4 || ids.size !== 8) weeksOk = false;
  }
  check('randomize: four games and eight teams each week', weeksOk);
  check('randomize: no playoff rows', rows.every((r) => !r.isPlayoff));
}

const teams = psql(
  `SELECT id FROM fantasy_teams WHERE league_id = '${leagueId}' ORDER BY team_name;`
).map((r) => r[0]);

function circleSchedule(teamIds) {
  const games = [];
  for (let week = 1; week <= 14; week++) {
    const round = (week - 1) % 7;
    const flip = week >= 8 && week <= 14;
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
      if (flip) [a, b] = [b, a];
      games.push({ week, fantasy_team1_id: a, fantasy_team2_id: b });
    }
  }
  return games;
}

{
  const bad = circleSchedule(teams);
  bad[0].fantasy_team2_id = bad[0].fantasy_team1_id;
  const { error } = await rpc('set_league_schedule', { p_league_id: leagueId, p_matchups: JSON.stringify(bad) }, owner.token);
  check('manual: rejects a team playing itself', !!error && /two different teams/.test(error.message), error?.message);

  const short = circleSchedule(teams).slice(0, 55);
  const { error: shortErr } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(short) },
    owner.token
  );
  check('manual: rejects a schedule that is not 56 games', !!shortErr && /56 matchups/.test(shortErr.message), shortErr?.message);

  const dup = circleSchedule(teams);
  dup[1].fantasy_team1_id = dup[0].fantasy_team1_id;
  const { error: dupErr } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(dup) },
    owner.token
  );
  check('manual: rejects a duplicated team in a week', !!dupErr && /8 distinct teams/.test(dupErr.message), dupErr?.message);

  const { error: okErr } = await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(circleSchedule(teams)) },
    owner.token
  );
  check('manual: accepts 56 valid games', !okErr, okErr?.message);
  check('manual: still 56 regular-season games', matchups(leagueId).length === 56);
}

psql(`UPDATE weeks SET is_locked = true WHERE league_id = '${leagueId}' AND week_number = 1;`);
{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('regenerate fails after a week lock', !!error, error?.message);
}
psql(`UPDATE weeks SET is_locked = false WHERE league_id = '${leagueId}' AND week_number = 1;`);

// One scored week. Winners are teams[0..3] with descending points, so seeds are teams[0]..teams[7].
const week14 = matchups(leagueId).filter((m) => m.week === 14);
const desired = [
  [teams[0], teams[7], 80, 10],
  [teams[1], teams[6], 70, 20],
  [teams[2], teams[5], 60, 30],
  [teams[3], teams[4], 50, 40],
];
for (const [hi, lo, hs, ls] of desired) {
  const game = week14.find((g) =>
    (g.t1 === hi && g.t2 === lo) || (g.t1 === lo && g.t2 === hi)
  );
  if (!game) continue;
  const t1Score = game.t1 === hi ? hs : ls;
  const t2Score = game.t1 === hi ? ls : hs;
  psql(
    `UPDATE league_matchups SET is_complete = true, team1_score = ${t1Score}, team2_score = ${t2Score}
     WHERE league_id = '${leagueId}' AND week = 14
       AND fantasy_team1_id = '${game.t1}' AND fantasy_team2_id = '${game.t2}';`
  );
}

// The real week-14 pairings may not be the desired pairs. Force the four games.
psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND week = 14;`);
for (const [hi, lo, hs, ls] of desired) {
  psql(
    `INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff, is_complete, team1_score, team2_score)
     VALUES ('${leagueId}', 14, '${hi}', '${lo}', false, true, ${hs}, ${ls});`
  );
}

const seeds = seedByPoints(leagueId);
check('seeds follow wins then points', seeds.slice(0, 8).join() === teams.join(), seeds.slice(0, 4).join(','));

function pairs(week) {
  return matchups(leagueId)
    .filter((m) => m.week === week && m.isPlayoff)
    .map((m) => [m.t1, m.t2].sort().join(':'));
}

function hasPair(week, a, b) {
  const key = [a, b].sort().join(':');
  return pairs(week).includes(key);
}

async function freshBracket(n) {
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND is_playoff;`);
  const { error } = await rpc(
    'set_league_season_settings',
    { p_league_id: leagueId, p_playoff_teams: n, p_standings_tiebreaker: 'record_then_points' },
    owner.token
  );
  if (error) return error.message;
  const { error: genErr } = await rpc('generate_playoffs', { p_league_id: leagueId }, owner.token);
  return genErr?.message || '';
}

{
  const err = await freshBracket(8);
  check('8-team: generate', err === '', err);
  const games = matchups(leagueId).filter((m) => m.week === 15 && m.isPlayoff);
  check('8-team: four quarterfinals', games.length === 4, String(games.length));
  check('8-team: 1v8', hasPair(15, seeds[0], seeds[7]));
  check('8-team: 2v7', hasPair(15, seeds[1], seeds[6]));
  check('8-team: 3v6', hasPair(15, seeds[2], seeds[5]));
  check('8-team: 4v5', hasPair(15, seeds[3], seeds[4]));
  const ids = new Set(games.flatMap((g) => [g.t1, g.t2]));
  check('8-team: every team plays', ids.size === 8);
}

{
  const err = await freshBracket(6);
  check('6-team: generate', err === '', err);
  const games = matchups(leagueId).filter((m) => m.week === 15 && m.isPlayoff);
  check('6-team: two games', games.length === 2, String(games.length));
  check('6-team: 3v6', hasPair(15, seeds[2], seeds[5]));
  check('6-team: 4v5', hasPair(15, seeds[3], seeds[4]));
  const ids = new Set(games.flatMap((g) => [g.t1, g.t2]));
  check('6-team: seeds 1 and 2 have a bye', !ids.has(seeds[0]) && !ids.has(seeds[1]));
  check('6-team: seeds 7 and 8 have no game', !ids.has(seeds[6]) && !ids.has(seeds[7]));
}

{
  const err = await freshBracket(5);
  check('5-team: generate', err === '', err);
  const games = matchups(leagueId).filter((m) => m.week === 15 && m.isPlayoff);
  check('5-team: two games', games.length === 2, String(games.length));
  check('5-team: 2v5', hasPair(15, seeds[1], seeds[4]));
  check('5-team: 3v4', hasPair(15, seeds[2], seeds[3]));
  const ids = new Set(games.flatMap((g) => [g.t1, g.t2]));
  check('5-team: seed 1 has a bye', !ids.has(seeds[0]));
  check('5-team: non-qualifiers have no game', !ids.has(seeds[5]) && !ids.has(seeds[6]) && !ids.has(seeds[7]));

  // 5 beats 2, 4 beats 3. Remaining: 1, 5, 4. Week 16 is 4 vs 5; seed 1 byes.
  for (const game of games) {
    const lowWins = (game.t1 === seeds[4] || game.t2 === seeds[4] || game.t1 === seeds[3] || game.t2 === seeds[3]);
    const winnerIsLower = game.t1 === seeds[4] || game.t1 === seeds[3];
    const s1 = lowWins && winnerIsLower ? 10 : 1;
    const s2 = lowWins && winnerIsLower ? 1 : 10;
    // Prefer the worse seed (higher index) as winner when they are in the game.
    const worse = [game.t1, game.t2].sort((a, b) => seeds.indexOf(b) - seeds.indexOf(a))[0];
    const t1 = game.t1 === worse ? 9 : 3;
    const t2 = game.t2 === worse ? 9 : 3;
    psql(
      `UPDATE league_matchups SET is_complete = true, team1_score = ${t1}, team2_score = ${t2}
       WHERE league_id = '${leagueId}' AND week = 15
         AND fantasy_team1_id = '${game.t1}' AND fantasy_team2_id = '${game.t2}';`
    );
    void s1; void s2;
  }
  const { error: advErr } = await rpc('generate_playoffs', { p_league_id: leagueId }, owner.token);
  check('5-team: advance to week 16', !advErr, advErr?.message);
  const w16 = matchups(leagueId).filter((m) => m.week === 16 && m.isPlayoff);
  check('5-team: one week-16 game', w16.length === 1, String(w16.length));
  check('5-team: week 16 is 4 vs 5', hasPair(16, seeds[3], seeds[4]));
  const w16ids = new Set(w16.flatMap((g) => [g.t1, g.t2]));
  check('5-team: best remaining seed byes', !w16ids.has(seeds[0]));
}

{
  const err = await freshBracket(4);
  check('4-team: generate', err === '', err);
  const games = matchups(leagueId).filter((m) => m.week === 15 && m.isPlayoff);
  check('4-team: two semifinals', games.length === 2, String(games.length));
  check('4-team: 1v4', hasPair(15, seeds[0], seeds[3]));
  check('4-team: 2v3', hasPair(15, seeds[1], seeds[2]));
  const ids = new Set(games.flatMap((g) => [g.t1, g.t2]));
  check('4-team: non-qualifiers have no game', [4, 5, 6, 7].every((i) => !ids.has(seeds[i])));

  const { error: locked } = await rpc(
    'set_league_season_settings',
    { p_league_id: leagueId, p_playoff_teams: 8, p_standings_tiebreaker: 'points_then_record' },
    owner.token
  );
  check('settings lock after bracket rows exist', !!locked, locked?.message);

  // Tie: seed 1 and seed 4 finish level. Better seed advances.
  const tie = games.find((g) =>
    (g.t1 === seeds[0] && g.t2 === seeds[3]) || (g.t1 === seeds[3] && g.t2 === seeds[0])
  );
  const other = games.find((g) => g !== tie);
  psql(
    `UPDATE league_matchups SET is_complete = true, team1_score = 12, team2_score = 12
     WHERE league_id = '${leagueId}' AND week = 15
       AND fantasy_team1_id = '${tie.t1}' AND fantasy_team2_id = '${tie.t2}';`
  );
  psql(
    `UPDATE league_matchups SET is_complete = true, team1_score = 8, team2_score = 4
     WHERE league_id = '${leagueId}' AND week = 15
       AND fantasy_team1_id = '${other.t1}' AND fantasy_team2_id = '${other.t2}';`
  );
  const { error: champErr } = await rpc('generate_playoffs', { p_league_id: leagueId }, owner.token);
  check('4-team: championship week', !champErr, champErr?.message);
  const champ = matchups(leagueId).filter((m) => m.week === 16 && m.isPlayoff);
  check('4-team: one championship', champ.length === 1, String(champ.length));
  const champIds = new Set(champ.flatMap((g) => [g.t1, g.t2]));
  check('tied playoff game: better seed advances', champIds.has(seeds[0]) && !champIds.has(seeds[3]));
}

// Tiebreaker flips order when wins and points disagree.
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND is_playoff;`);
  psql(`UPDATE league_matchups SET is_complete = false, team1_score = NULL, team2_score = NULL WHERE league_id = '${leagueId}';`);
  // teams[0] beats teams[7] twice (2 wins, 10 points). teams[1] beats teams[6] once for 100.
  const weeks = [1, 2];
  for (const week of weeks) {
    psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND week = ${week};`);
  }
  psql(
    `INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_complete, team1_score, team2_score)
     VALUES
       ('${leagueId}', 1, '${teams[0]}', '${teams[7]}', true, 5, 0),
       ('${leagueId}', 2, '${teams[0]}', '${teams[6]}', true, 5, 0),
       ('${leagueId}', 1, '${teams[1]}', '${teams[5]}', true, 100, 0);`
  );
  // week 1 now has two games only; standings still rank by the completed games.
  const { error } = await rpc(
    'set_league_season_settings',
    { p_league_id: leagueId, p_playoff_teams: 4, p_standings_tiebreaker: 'record_then_points' },
    owner.token
  );
  check('tiebreaker: can set record_then_points before a bracket', !error, error?.message);
  const byRecord = seedByPoints(leagueId);
  check('tiebreaker: more wins rank first', byRecord[0] === teams[0], byRecord.slice(0, 2).join(','));

  const { error: flipErr } = await rpc(
    'set_league_season_settings',
    { p_league_id: leagueId, p_playoff_teams: 4, p_standings_tiebreaker: 'points_then_record' },
    owner.token
  );
  check('tiebreaker: switch to points_then_record', !flipErr, flipErr?.message);
  const byPoints = seedByPoints(leagueId);
  check('tiebreaker: more points rank first when that mode is set', byPoints[0] === teams[1], byPoints.slice(0, 2).join(','));
}

if (failures > 0) {
  console.log(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll playoff checks passed');
