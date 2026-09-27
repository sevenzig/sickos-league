#!/usr/bin/env node
// Sync NFL kickoff times from ESPN scoreboard into upsert_nfl_kickoff_times.
//
// Usage:
//   API_URL=http://localhost:3001/api \
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret \
//   node scripts/sync-nfl-kickoffs-espn.mjs --year 2025 --week 1
//
//   --weeks 3,4,5   # Wednesday flex re-upsert (N..N+2)
//   --all-season    # weeks 1..18
//
// Ops: season start --all-season; Wednesday ~9pm America/New_York re-sync N..N+2.
// Bye pills appear only after a week has at least one seeded game_time.

import process from 'node:process';

const API = process.env.API_URL || 'http://localhost:3001/api';

// Keep in sync with teamNameMap in src/utils/csvParser.ts (source of truth).
const teamNameMap = {
  CAR: 'Carolina',
  JAX: 'Jacksonville',
  CIN: 'Cincinnati',
  CLE: 'Cleveland',
  MIA: 'Miami',
  IND: 'Indianapolis',
  LV: 'Las Vegas',
  NE: 'New England',
  HOU: 'Houston',
  LAR: 'LA Rams',
  TB: 'Tampa Bay',
  ATL: 'Atlanta',
  PIT: 'Pittsburgh',
  NYJ: 'NY Jets',
  TEN: 'Tennessee',
  DEN: 'Denver',
  ARI: 'Arizona',
  NO: 'New Orleans',
  NYG: 'NY Giants',
  WSH: 'Washington',
  BAL: 'Baltimore',
  BUF: 'Buffalo',
  DET: 'Detroit',
  GB: 'Green Bay',
  SF: 'San Francisco',
  SEA: 'Seattle',
  MIN: 'Minnesota',
  CHI: 'Chicago',
  KC: 'Kansas City',
  LAC: 'LA Chargers',
  DAL: 'Dallas',
  PHI: 'Philadelphia',
};

function usage() {
  console.error(
    'Usage: node scripts/sync-nfl-kickoffs-espn.mjs --year YYYY (--week N | --weeks N,N+1,N+2 | --all-season) [--email e --password p]'
  );
  process.exit(2);
}

const args = process.argv.slice(2);
let year = null;
let weeks = [];
let email = process.env.ADMIN_EMAIL || null;
let password = process.env.ADMIN_PASSWORD || null;
let weekExplicit = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--year') year = Number(args[++i]);
  else if (args[i] === '--week') {
    weeks = [Number(args[++i])];
    weekExplicit = true;
  } else if (args[i] === '--weeks') {
    weeks = String(args[++i])
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 1);
    weekExplicit = true;
  } else if (args[i] === '--all-season') {
    weeks = Array.from({ length: 18 }, (_, i) => i + 1);
  } else if (args[i] === '--email') email = args[++i];
  else if (args[i] === '--password') password = args[++i];
  else usage();
}

if (!year || year < 2000 || weeks.length === 0 || !email || !password) usage();
if (weeks.some((w) => !Number.isFinite(w) || w < 1 || w > 22)) usage();

function mapAbbr(abbr) {
  const name = teamNameMap[abbr];
  if (!name) {
    throw new Error(`Unknown ESPN abbreviation (not in teamNameMap): ${abbr}`);
  }
  return name;
}

async function api(pathname, { method, body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${pathname}`, {
    method: method || 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(json.error?.message || `HTTP ${res.status}`);
  }
  return json;
}

async function fetchWeekGames(seasonYear, week) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` +
    `?dates=${seasonYear}&seasontype=2&week=${week}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN scoreboard HTTP ${res.status} for week ${week}`);
  }
  const data = await res.json();
  const events = data.events || [];
  const games = [];
  for (const event of events) {
    const comps = event.competitions?.[0]?.competitors;
    if (!comps || comps.length < 2) {
      throw new Error(`Event ${event.id} missing competitors for week ${week}`);
    }
    const home = comps.find((c) => c.homeAway === 'home') || comps[0];
    const away = comps.find((c) => c.homeAway === 'away') || comps[1];
    const abbr1 = away.team?.abbreviation;
    const abbr2 = home.team?.abbreviation;
    if (!abbr1 || !abbr2) {
      throw new Error(`Event ${event.id} missing team abbreviations`);
    }
    const game_time = event.date;
    if (!game_time) {
      throw new Error(`Event ${event.id} missing date`);
    }
    games.push({
      // upsert_nfl_kickoff_times: team1=away, team2=home
      team1: mapAbbr(abbr1),
      team2: mapAbbr(abbr2),
      game_time,
    });
  }
  return games;
}

const login = await api('/auth/login', {
  body: { email, password },
});
if (!login.token) {
  console.error('Sign-in failed:', login.error?.message || login);
  process.exit(1);
}

for (const week of weeks) {
  let games;
  try {
    games = await fetchWeekGames(year, week);
  } catch (e) {
    console.error(`Week ${week}: ESPN fetch failed:`, e instanceof Error ? e.message : e);
    process.exit(1);
  }

  if (games.length === 0 && weekExplicit) {
    console.error(`Week ${week}: zero events from ESPN (failing because week was explicit)`);
    process.exit(1);
  }

  if (games.length === 0) {
    console.warn(`Week ${week}: zero events — skipping`);
    continue;
  }

  try {
    const result = await api('/rpc/upsert_nfl_kickoff_times', {
      body: { p_week: week, p_games: JSON.stringify(games) },
      token: login.token,
    });
    console.log(`Week ${week}: upserted ${result.data} kickoff row(s) (${games.length} games from ESPN)`);
  } catch (e) {
    console.error(`Week ${week}: upsert failed:`, e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
