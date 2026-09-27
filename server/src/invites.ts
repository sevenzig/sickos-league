import { Router } from 'express';
import { adminPool } from './db.js';

const MAX_TEAMS = 8;

/** Public invite preview (no auth). Redeem stays on authenticated RPC. */
export const invitesRouter = Router();

invitesRouter.get('/:code', async (req, res) => {
  const code = String(req.params.code ?? '')
    .trim()
    .toUpperCase();
  if (!code || code.length > 16) {
    res.status(404).json({ error: { message: 'Invite not found' } });
    return;
  }

  try {
    const { rows } = await adminPool.query(
      `SELECT
         l.id AS league_id,
         l.name AS league_name,
         l.join_code AS code,
         l.join_code_expires_at AS expires_at,
         l.draft_status,
         (SELECT COUNT(*)::int FROM fantasy_teams ft WHERE ft.league_id = l.id) AS team_count
       FROM leagues l
       WHERE l.join_code = $1`,
      [code]
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: { message: 'Invite not found' } });
      return;
    }

    const notExpired =
      row.expires_at == null || new Date(row.expires_at) > new Date();
    const seatsRemaining = Math.max(0, MAX_TEAMS - (row.team_count ?? 0));
    const isValid =
      notExpired &&
      row.draft_status === 'pending' &&
      seatsRemaining > 0;

    res.json({
      code: row.code,
      league_id: row.league_id,
      league_name: row.league_name,
      expires_at: row.expires_at,
      is_valid: isValid,
    });
  } catch (err) {
    res.status(500).json({
      error: { message: (err as Error).message || 'Failed to load invite' },
    });
  }
});
