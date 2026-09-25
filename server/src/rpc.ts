import { Router } from 'express';
import { adminPool, runAsUser } from './db.js';
import { requireUser, type AuthedRequest } from './auth.js';

/** SQL functions the client is allowed to call via the /rpc endpoint. */
const RPC_ALLOWLIST = new Set([
  'create_league',
  'create_fantasy_team',
  'get_user_leagues',
  'get_league_details',
  'get_league_fantasy_teams',
  'redeem_invite_code',
  'cleanup_expired_invitations',
  'generate_league_schedule',
  'set_league_schedule',
  'set_league_season_settings',
  'generate_playoffs',
  'get_league_schedule',
  'start_draft',
  'start_offline_draft',
  'set_offline_draft_picks',
  'make_draft_pick',
  'make_draft_pick_for',
  'get_draft_state',
  'set_draft_order',
  'fill_draft_bots',
  'update_league_draft_settings',
  'pause_draft',
  'resume_draft',
  'set_fantasy_lineup',
  'lock_fantasy_lineup',
  'finalize_week_lineups',
  'get_fantasy_lineups_for_week',
  'get_team_roster',
  'get_league_rosters',
  'get_nfl_kickoff_times',
  'upsert_nfl_kickoff_times',
  'set_week_lock',
  'toggle_week_lock',
  'get_week_status',
  'finalize_week_scores',
  'get_user_profile_with_teams',
  'update_user_profile',
  'update_fantasy_team_name',
  'remove_league_member',
  'transfer_commissioner',
  'delete_league',
]);

interface FnSignature {
  retset: boolean;
  argNames: string[];
}

const signatureCache = new Map<string, FnSignature>();

async function getSignature(fn: string): Promise<FnSignature | null> {
  const cached = signatureCache.get(fn);
  if (cached) return cached;

  const { rows } = await adminPool.query(
    `SELECT p.proretset AS retset,
            COALESCE(p.proargnames, '{}') AS argnames,
            p.pronargs
     FROM pg_proc p
     JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = $1
     ORDER BY p.pronargs DESC
     LIMIT 1`,
    [fn]
  );
  if (!rows[0]) return null;
  const sig: FnSignature = {
    retset: rows[0].retset,
    argNames: (rows[0].argnames as string[]).slice(0, rows[0].pronargs),
  };
  signatureCache.set(fn, sig);
  return sig;
}

export const rpcRouter = Router();

rpcRouter.post('/:fn', requireUser, async (req: AuthedRequest, res) => {
  const fn = req.params.fn;
  if (!/^[a-z_][a-z0-9_]*$/.test(fn) || !RPC_ALLOWLIST.has(fn)) {
    res.status(404).json({ error: { message: `Could not find the function public.${fn}`, code: 'PGRST202' } });
    return;
  }

  const sig = await getSignature(fn);
  if (!sig) {
    res.status(404).json({ error: { message: `Could not find the function public.${fn}`, code: 'PGRST202' } });
    return;
  }

  const args: Record<string, unknown> = req.body ?? {};
  const provided = Object.keys(args).filter((k) => args[k] !== undefined);
  const unknown = provided.filter((k) => !sig.argNames.includes(k));
  if (unknown.length > 0) {
    res.status(400).json({ error: { message: `Unknown argument(s) for ${fn}: ${unknown.join(', ')}` } });
    return;
  }

  // Named notation so omitted args fall back to their SQL defaults
  const params = provided.map((k) => args[k]);
  const argList = provided.map((k, i) => `"${k}" => $${i + 1}`).join(', ');
  const sql = sig.retset
    ? `SELECT * FROM "${fn}"(${argList})`
    : `SELECT "${fn}"(${argList}) AS result`;

  try {
    const result = await runAsUser(req.userId ?? null, (client) => client.query(sql, params));
    const data = sig.retset ? result.rows : result.rows[0]?.result ?? null;
    res.json({ data });
  } catch (err) {
    const e = err as { message?: string; code?: string };
    res.status(400).json({ error: { message: e.message ?? 'RPC failed', code: e.code } });
  }
});
