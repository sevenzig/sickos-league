#!/usr/bin/env node
// Seed NFL kickoff times for a week via upsert_nfl_kickoff_times (platform-admin).
//
// Usage:
//   API_URL=http://localhost:3001/api \
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret \
//   node scripts/seed-nfl-kickoffs.mjs --week 1 --file scripts/data/week-kickoffs.example.json
//
// Ops: before Thursday lock for week N, load that week's kickoffs with this script
// (or an equivalent platform-admin RPC call). Missing game_time leaves that NFL
// team editable; do not skip the week if any early games (TNF) need locks.

import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API_URL || 'http://localhost:3001/api';

function usage() {
  console.error(
    'Usage: node scripts/seed-nfl-kickoffs.mjs --week <N> --file <path.json> [--email e --password p]'
  );
  process.exit(2);
}

const args = process.argv.slice(2);
let week = null;
let file = null;
let email = process.env.ADMIN_EMAIL || null;
let password = process.env.ADMIN_PASSWORD || null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--week') week = Number(args[++i]);
  else if (args[i] === '--file') file = args[++i];
  else if (args[i] === '--email') email = args[++i];
  else if (args[i] === '--password') password = args[++i];
  else usage();
}
if (!week || week < 1 || !file || !email || !password) usage();

const games = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
if (!Array.isArray(games) || games.length === 0) {
  console.error('File must be a non-empty JSON array of { team1, team2, game_time }');
  process.exit(1);
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

const login = await api('/auth/login', {
  body: { email, password },
});
if (!login.token) {
  console.error('Sign-in failed:', login.error?.message || login);
  process.exit(1);
}

let result;
try {
  result = await api('/rpc/upsert_nfl_kickoff_times', {
    body: { p_week: week, p_games: JSON.stringify(games) },
    token: login.token,
  });
} catch (e) {
  console.error('upsert_nfl_kickoff_times failed:', e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log(`Upserted ${result.data} kickoff row(s) for week ${week}`);
