// Configurable regular season (14/15/16) and playoff brackets (4/5/6).
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

function circleSchedule(teamIds, rsWeeks = 14) {
  const games = [];
  for (let week = 1; week <= rsWeeks; week++) {
    const round = (week - 1) % 7;
    const flip = Math.floor((week - 1) / 7) % 2 === 1;
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

function weekPairsMatch(regular, weekA, weekB, flipped = false) {
  const a = regular.filter((r) => r.week === weekA);
  const b = regular.filter((r) => r.week === weekB);
  if (a.length !== 4 || b.length !== 4) return false;
  return a.every((game) =>
    b.some((other) =>
      flipped
        ? other.t1 === game.t2 && other.t2 === game.t1
        : other.t1 === game.t1 && other.t2 === game.t2
    )
  );
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
    p_playoff_teams: 6,
    p_standings_tiebreaker: 'record_then_points',
    p_regular_season_weeks: 14,
  },
  owner.token
);
check('setup: create league', !leagueErr && !!leagueId, leagueErr?.message);

{
  const { error } = await rpc(
    'create_league',
    {
      league_name: `Bad RS16 ${Date.now()}`,
      season: 2025,
      teams_started_per_week: 1,
      owner_team_name: 'Owner Team',
      p_draft_mode: 'async',
      p_playoff_teams: 6,
      p_regular_season_weeks: 16,
    },
    owner.token
  );
  check(
    'create: RS=16 + playoff 6 rejected',
    !!error && /16-week|week 18/i.test(error.message),
    error?.message
  );
}

{
  const { error } = await rpc(
    'create_league',
    {
      league_name: `Bad Field8 ${Date.now()}`,
      season: 2025,
      teams_started_per_week: 1,
      owner_team_name: 'Owner Team',
      p_draft_mode: 'async',
      p_playoff_teams: 8,
    },
    owner.token
  );
  check(
    'create: playoff_teams=8 rejected',
    !!error && /4, 5, or 6/.test(error.message),
    error?.message
  );
}

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

// Settings: extend 14 → 16, then trim back; reject RS=16 + field 6
{
  const { error: badCombo } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 6,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 16,
    },
    owner.token
  );
  check(
    'settings: RS=16 + playoff 6 rejected',
    !!badCombo && /16-week|week 18/i.test(badCombo.message),
    badCombo?.message
  );
  check('settings: reject left schedule at 56', matchups(leagueId).filter((r) => !r.isPlayoff).length === 56);

  const before = matchups(leagueId).filter((r) => !r.isPlayoff);
  const { error: extendErr } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 16,
    },
    owner.token
  );
  check('settings: 14→16 append succeeds', !extendErr, extendErr?.message);
  const after16 = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('settings: 64 games after extend', after16.length === 64, String(after16.length));
  check('settings: weeks 1–14 unchanged', before.every((g) =>
    after16.some((r) => r.week === g.week && r.t1 === g.t1 && r.t2 === g.t2)
  ));
  check('settings: week 15 ≡ week 1', weekPairsMatch(after16, 15, 1, false));
  check('settings: week 16 ≡ week 2', weekPairsMatch(after16, 16, 2, false));
  check('settings: week 8 flipped vs week 1', weekPairsMatch(after16, 8, 1, true));

  const { error: trimErr } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 6,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 14,
    },
    owner.token
  );
  check('settings: 16→14 trim succeeds', !trimErr, trimErr?.message);
  const after14 = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('settings: 56 games after trim', after14.length === 56, String(after14.length));
  check('settings: no weeks > 14', after14.every((r) => r.week <= 14));
}

// Auto-gen at RS=16
{
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
  check('setup RS=16 for regenerate', !set16, set16?.message);
  const { error: gen16 } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('randomize RS=16 succeeds', !gen16, gen16?.message);
  const regular = matchups(leagueId).filter((r) => !r.isPlayoff);
  check('randomize RS=16: 64 games', regular.length === 64, String(regular.length));
  check('randomize RS=16: week 15 ≡ week 1', weekPairsMatch(regular, 15, 1, false));
  check('randomize RS=16: week 16 ≡ week 2', weekPairsMatch(regular, 16, 2, false));
  check('randomize RS=16: week 8 flipped vs 1', weekPairsMatch(regular, 8, 1, true));

  // Restore to RS=14 for bracket tests
  await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 6,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 14,
    },
    owner.token
  );
  await rpc(
    'set_league_schedule',
    { p_league_id: leagueId, p_matchups: JSON.stringify(circleSchedule(teams, 14)) },
    owner.token
  );
}

psql(`UPDATE weeks SET is_locked = true WHERE league_id = '${leagueId}' AND week_number = 1;`);
{
  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('regenerate fails after a week lock', !!error, error?.message);
}
psql(`UPDATE weeks SET is_locked = false WHERE league_id = '${leagueId}' AND week_number = 1;`);

const desired = [
  [teams[0], teams[7], 80, 10],
  [teams[1], teams[6], 70, 20],
  [teams[2], teams[5], 60, 30],
  [teams[3], teams[4], 50, 40],
];
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

async function freshBracket(n, rs = 14) {
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND is_playoff;`);
  const { error } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: n,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: rs,
    },
    owner.token
  );
  if (error) return error.message;
  const { error: genErr } = await rpc('generate_playoffs', { p_league_id: leagueId }, owner.token);
  return genErr?.message || '';
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

  for (const game of games) {
    const worse = [game.t1, game.t2].sort((a, b) => seeds.indexOf(b) - seeds.indexOf(a))[0];
    const t1 = game.t1 === worse ? 9 : 3;
    const t2 = game.t2 === worse ? 9 : 3;
    psql(
      `UPDATE league_matchups SET is_complete = true, team1_score = ${t1}, team2_score = ${t2}
       WHERE league_id = '${leagueId}' AND week = 15
         AND fantasy_team1_id = '${game.t1}' AND fantasy_team2_id = '${game.t2}';`
    );
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
    {
      p_league_id: leagueId,
      p_playoff_teams: 6,
      p_standings_tiebreaker: 'points_then_record',
      p_regular_season_weeks: 14,
    },
    owner.token
  );
  check('settings lock after bracket rows exist', !!locked, locked?.message);

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

// RS=16 4-team: playoffs in weeks 17–18
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND is_playoff;`);
  // Need week 16 complete as last RS week — rebuild schedule at RS=16 then force week-16 scores
  const { error: to16 } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 16,
    },
    owner.token
  );
  check('RS16 bracket: set RS=16', !to16, to16?.message);
  // Append may have left weeks 15–16; ensure week 16 has scored games matching seed order
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND week = 16 AND COALESCE(is_playoff, false) = false;`);
  for (const [hi, lo, hs, ls] of desired) {
    psql(
      `INSERT INTO league_matchups (league_id, week, fantasy_team1_id, fantasy_team2_id, is_playoff, is_complete, team1_score, team2_score)
       VALUES ('${leagueId}', 16, '${hi}', '${lo}', false, true, ${hs}, ${ls});`
    );
  }
  const { error: gen16po } = await rpc('generate_playoffs', { p_league_id: leagueId }, owner.token);
  check('RS16 4-team: generate', !gen16po, gen16po?.message);
  const w17 = matchups(leagueId).filter((m) => m.week === 17 && m.isPlayoff);
  check('RS16 4-team: semis in week 17', w17.length === 2, String(w17.length));
  check('RS16 4-team: 1v4', hasPair(17, seeds[0], seeds[3]));
  check('RS16 4-team: 2v3', hasPair(17, seeds[1], seeds[2]));
}

// Tiebreaker flips order when wins and points disagree.
{
  psql(`DELETE FROM league_matchups WHERE league_id = '${leagueId}' AND is_playoff;`);
  psql(`UPDATE league_matchups SET is_complete = false, team1_score = NULL, team2_score = NULL WHERE league_id = '${leagueId}';`);
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
  const { error } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'record_then_points',
      p_regular_season_weeks: 14,
    },
    owner.token
  );
  check('tiebreaker: can set record_then_points before a bracket', !error, error?.message);
  const byRecord = seedByPoints(leagueId);
  check('tiebreaker: more wins rank first', byRecord[0] === teams[0], byRecord.slice(0, 2).join(','));

  const { error: flipErr } = await rpc(
    'set_league_season_settings',
    {
      p_league_id: leagueId,
      p_playoff_teams: 4,
      p_standings_tiebreaker: 'points_then_record',
      p_regular_season_weeks: 14,
    },
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
