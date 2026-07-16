// Phase 5 verification against the self-contained stack (docker compose up).
//
// Covers:
//   5.1  remove_league_member (owner-only, pre-draft only, team removed,
//        audit-logged), transfer_commissioner (owner-only, roles swap,
//        audit-logged), delete_league (owner-only, cascades, audit row with
//        NULL league_id survives), generate_league_schedule pre-season gate
//   5.2  fantasy_teams.logo_url surfaced by get_league_fantasy_teams and
//        v_league_standings
//
// Run: node scripts/verify-phase5.mjs

const API = process.env.API_URL || 'http://localhost:3001/api';
const SEASON = 2025;

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
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: `Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}` } };
  }
}

const rpc = (fn, args, token) => api(`/rpc/${fn}`, { body: args ?? {}, token });
const dbq = (query, token) => api('/db/query', { body: query, token });

async function signup(label) {
  const email = `verify5-${label}-${Date.now()}@test.local`;
  const res = await api('/auth/signup', { body: { email, password: 'verify-test-password' } });
  if (!res.token) throw new Error(`signup failed for ${label}: ${res.error?.message}`);
  return { token: res.token, userId: res.user.id, email };
}

const randomCode = () =>
  Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');

async function inviteAndJoin(leagueId, ownerToken, joiner, teamName) {
  const code = randomCode();
  const { error: invErr } = await dbq(
    {
      table: 'league_invitations',
      action: 'insert',
      values: { code, league_id: leagueId, expires_at: new Date(Date.now() + 86400000).toISOString(), is_active: true },
    },
    ownerToken
  );
  if (invErr) throw new Error(`invite: ${invErr.message}`);
  const { error } = await rpc('redeem_invite_code', { p_invite_code: code, p_team_name: teamName }, joiner.token);
  if (error) throw new Error(`join: ${error.message}`);
}

// --- Setup: owner + member B in one league --------------------------------

const owner = await signup('owner');
const memberB = await signup('memberb');

const { data: leagueId, error: leagueErr } = await rpc(
  'create_league',
  {
    league_name: `Verify5 ${Date.now()}`,
    season: SEASON,
    teams_started_per_week: 2,
    owner_team_name: 'Owner Team',
  },
  owner.token
);
check('setup: create_league', !leagueErr && !!leagueId, leagueErr?.message);

await inviteAndJoin(leagueId, owner.token, memberB, 'Team B');
check('setup: member B joined', true);

// --- 5.1 remove_league_member ----------------------------------------------

// Non-owner cannot remove
{
  const { error } = await rpc('remove_league_member', { p_league_id: leagueId, p_user_id: owner.userId }, memberB.token);
  check('remove_league_member rejected for non-owner', !!error, error?.message);
}

// Owner cannot remove themselves
{
  const { error } = await rpc('remove_league_member', { p_league_id: leagueId, p_user_id: owner.userId }, owner.token);
  check('remove_league_member rejects removing the owner', !!error, error?.message);
}

// Owner removes B pre-draft: membership and fantasy team both go
{
  const { data, error } = await rpc('remove_league_member', { p_league_id: leagueId, p_user_id: memberB.userId }, owner.token);
  check('owner removes member B pre-draft', !error && data === true, error?.message);

  const { data: teams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
  check('removed member\'s fantasy team is gone', teams.length === 1 && teams[0].manager_user_id === owner.userId, `teams=${teams.length}`);

  const { data: bLeagues } = await rpc('get_user_leagues', {}, memberB.token);
  check('removed member no longer sees the league', !bLeagues?.some((l) => l.id === leagueId));

  const { data: logs } = await dbq(
    {
      table: 'audit_logs',
      action: 'select',
      select: '*',
      filters: [
        { op: 'eq', column: 'league_id', value: leagueId },
        { op: 'eq', column: 'action', value: 'REMOVE_MEMBER' },
      ],
    },
    owner.token
  );
  check('REMOVE_MEMBER audit-logged with team details', logs?.length === 1 && logs[0].details?.fantasy_team_name === 'Team B');
}

// B rejoins for the rest of the tests
await inviteAndJoin(leagueId, owner.token, memberB, 'Team B');

// Fill to 8 teams (6 unmanaged) and complete the draft directly (Phase 2
// covers real drafting; here the gate itself is under test).
{
  const rows = Array.from({ length: 6 }, (_, i) => ({ league_id: leagueId, team_name: `Team ${i + 3}` }));
  const { error } = await dbq({ table: 'fantasy_teams', action: 'insert', values: rows }, owner.token);
  check('setup: 8 fantasy teams', !error, error?.message);

  const { error: updErr } = await dbq(
    {
      table: 'leagues',
      action: 'update',
      values: { draft_status: 'complete' },
      filters: [{ op: 'eq', column: 'id', value: leagueId }],
    },
    owner.token
  );
  check('setup: draft marked complete', !updErr, updErr?.message);
}

// Post-draft removal must fail
{
  const { error } = await rpc('remove_league_member', { p_league_id: leagueId, p_user_id: memberB.userId }, owner.token);
  check('remove_league_member rejected once draft is not pending', !!error, error?.message);
}

// --- 5.1 Schedule regenerate gate -------------------------------------------

{
  const { data, error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('generate_league_schedule succeeds after draft', !error && data === true, error?.message);
}
{
  // Pre-season regenerate is allowed (nothing locked, no scores)
  const { data, error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('regenerate allowed pre-season', !error && data === true, error?.message);
}
{
  const { error: lockErr } = await rpc(
    'toggle_week_lock',
    { p_league_id: leagueId, p_week_number: 1, p_lock_state: true },
    owner.token
  );
  check('setup: week 1 locked', !lockErr, lockErr?.message);

  const { error } = await rpc('generate_league_schedule', { p_league_id: leagueId }, owner.token);
  check('regenerate rejected once a week is locked', !!error, error?.message);

  // Unlock again so the league is usable for the remaining checks
  await rpc('toggle_week_lock', { p_league_id: leagueId, p_week_number: 1, p_lock_state: false }, owner.token);
}

// --- 5.2 Team identity: logo_url surfaced everywhere -------------------------

{
  const { data: teams } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
  const ownerTeam = teams.find((t) => t.manager_user_id === owner.userId);
  check('get_league_fantasy_teams returns logo_url (null before upload)', 'logo_url' in ownerTeam, Object.keys(ownerTeam).join(','));

  const logoPath = `/photos/teams/${ownerTeam.id}/logo.png`;
  const { error } = await dbq(
    {
      table: 'fantasy_teams',
      action: 'update',
      values: { logo_url: logoPath },
      filters: [{ op: 'eq', column: 'id', value: ownerTeam.id }],
    },
    owner.token
  );
  check('logo_url set on fantasy team', !error, error?.message);

  const { data: after } = await rpc('get_league_fantasy_teams', { p_league_id: leagueId }, owner.token);
  check(
    'get_league_fantasy_teams round-trips logo_url',
    after.find((t) => t.id === ownerTeam.id)?.logo_url === logoPath
  );

  const { data: standings, error: standErr } = await dbq(
    {
      table: 'v_league_standings',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
      order: [{ column: 'rank' }],
    },
    owner.token
  );
  const standRow = standings?.find((r) => r.fantasy_team_id === ownerTeam.id);
  check('v_league_standings exposes logo_url', !standErr && standRow?.logo_url === logoPath, standErr?.message);
}

// --- 5.1 transfer_commissioner -----------------------------------------------

// Non-owner cannot transfer (B tries to hand the league to himself... via owner)
{
  const { error } = await rpc('transfer_commissioner', { p_league_id: leagueId, p_new_owner_user_id: owner.userId }, memberB.token);
  check('transfer_commissioner rejected for non-owner', !!error, error?.message);
}

// Owner -> B
{
  const { data, error } = await rpc('transfer_commissioner', { p_league_id: leagueId, p_new_owner_user_id: memberB.userId }, owner.token);
  check('owner transfers commissioner to B', !error && data === true, error?.message);

  const { data: bDetails } = await rpc('get_league_details', { league_id: leagueId }, memberB.token);
  const { data: oDetails } = await rpc('get_league_details', { league_id: leagueId }, owner.token);
  check('B is now owner, old owner is member', bDetails?.[0]?.user_role === 'owner' && oDetails?.[0]?.user_role === 'member',
    `B=${bDetails?.[0]?.user_role} old=${oDetails?.[0]?.user_role}`);

  // Old owner lost admin powers
  const { error: exOwnerErr } = await rpc('delete_league', { p_league_id: leagueId }, owner.token);
  check('old owner can no longer delete the league', !!exOwnerErr, exOwnerErr?.message);

  const { data: logs } = await dbq(
    {
      table: 'audit_logs',
      action: 'select',
      select: '*',
      filters: [
        { op: 'eq', column: 'league_id', value: leagueId },
        { op: 'eq', column: 'action', value: 'TRANSFER_OWNERSHIP' },
      ],
    },
    memberB.token
  );
  check('TRANSFER_OWNERSHIP audit-logged', logs?.length === 1 && logs[0].details?.new_owner_user_id === memberB.userId);
}

// Transfer back so the original owner runs the delete test
{
  const { error } = await rpc('transfer_commissioner', { p_league_id: leagueId, p_new_owner_user_id: owner.userId }, memberB.token);
  check('commissioner transferred back', !error, error?.message);
}

// --- 5.1 delete_league --------------------------------------------------------

// Non-owner cannot delete
{
  const { error } = await rpc('delete_league', { p_league_id: leagueId }, memberB.token);
  check('delete_league rejected for non-owner', !!error, error?.message);
}

{
  const { data, error } = await rpc('delete_league', { p_league_id: leagueId }, owner.token);
  check('owner deletes the league', !error && data === true, error?.message);

  const { data: leagues } = await rpc('get_user_leagues', {}, owner.token);
  check('deleted league gone from get_user_leagues', !leagues?.some((l) => l.id === leagueId));

  const { data: teams } = await dbq(
    {
      table: 'fantasy_teams',
      action: 'select',
      select: 'id',
      filters: [{ op: 'eq', column: 'league_id', value: leagueId }],
    },
    owner.token
  );
  check('fantasy teams cascaded away', (teams ?? []).length === 0, `left=${teams?.length}`);

  // The DELETE audit row survives the cascade (league_id NULL, actor-visible)
  const { data: logs } = await dbq(
    {
      table: 'audit_logs',
      action: 'select',
      select: '*',
      filters: [
        { op: 'eq', column: 'user_id', value: owner.userId },
        { op: 'eq', column: 'action', value: 'DELETE' },
        { op: 'eq', column: 'entity_id', value: leagueId },
      ],
    },
    owner.token
  );
  check(
    'DELETE audit row survives with NULL league_id + league name in details',
    logs?.length === 1 && logs[0].league_id === null && !!logs[0].details?.league_name,
    logs?.length !== 1 ? `rows=${logs?.length}` : undefined
  );
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
