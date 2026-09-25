import { Router } from 'express';
import { adminPool } from './db.js';

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
      `SELECT i.code, i.league_id, i.expires_at, i.is_active, i.used_at, l.name AS league_name
       FROM league_invitations i
       JOIN leagues l ON l.id = i.league_id
       WHERE i.code = $1`,
      [code]
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: { message: 'Invite not found' } });
      return;
    }

    const isValid =
      row.is_active === true &&
      !row.used_at &&
      new Date(row.expires_at) > new Date();

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
