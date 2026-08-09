import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { adminPool, runAsUser } from './db.js';
import { requireUser, type AuthedRequest } from './auth.js';

const MAX_TEAMS = 8;
const MIN_PASSWORD_LEN = 6;

/** Resolve short 8-char prefix or full UUID to a league row (admin; no membership required). */
async function resolveLeague(
  leagueIdParam: string
): Promise<{ id: string; name: string; season: number; draft_status: string; join_password_hash: string | null } | null> {
  const id = leagueIdParam.trim();
  if (!id) return null;

  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    const { rows } = await adminPool.query(
      `SELECT id, name, season, draft_status, join_password_hash
       FROM leagues WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  if (/^[a-zA-Z0-9]{8}$/.test(id)) {
    const { rows } = await adminPool.query(
      `SELECT id, name, season, draft_status, join_password_hash
       FROM leagues
       WHERE id::text ILIKE $1
       ORDER BY created_at ASC
       LIMIT 2`,
      [`${id}%`]
    );
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      // Ambiguous short id — prefer exact 8-char prefix uniqueness failure to wrong league
      throw Object.assign(new Error('Ambiguous league id'), { status: 400 });
    }
    return rows[0];
  }

  return null;
}

async function assertOwner(leagueId: string, userId: string): Promise<boolean> {
  const { rows } = await adminPool.query(
    `SELECT 1 FROM league_members
     WHERE league_id = $1 AND user_id = $2 AND role = 'owner'`,
    [leagueId, userId]
  );
  return rows.length > 0;
}

export const leagueJoinRouter = Router();

leagueJoinRouter.put(
  '/:leagueId/join-password',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const password = req.body?.password;
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LEN) {
        res.status(400).json({
          error: { message: `Password must be at least ${MIN_PASSWORD_LEN} characters` },
        });
        return;
      }

      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }

      if (!(await assertOwner(league.id, req.userId!))) {
        res.status(403).json({ error: { message: 'Only the league owner can set the join password' } });
        return;
      }

      const hash = await bcrypt.hash(password, 10);
      await adminPool.query(`UPDATE leagues SET join_password_hash = $2 WHERE id = $1`, [
        league.id,
        hash,
      ]);

      res.json({ ok: true, has_password: true });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: { message: (err as Error).message || 'Failed to set password' } });
    }
  }
);

leagueJoinRouter.get(
  '/:leagueId/join-info',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }

      const [{ rows: memberRows }, { rows: countRows }] = await Promise.all([
        adminPool.query(
          `SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`,
          [league.id, req.userId]
        ),
        adminPool.query(
          `SELECT COUNT(*)::int AS n FROM fantasy_teams WHERE league_id = $1`,
          [league.id]
        ),
      ]);

      const teamCount = countRows[0]?.n ?? 0;
      const seatsRemaining = Math.max(0, MAX_TEAMS - teamCount);

      res.json({
        id: league.id,
        name: league.name,
        season: league.season,
        has_password: league.join_password_hash != null,
        draft_status: league.draft_status,
        seats_remaining: seatsRemaining,
        already_member: memberRows.length > 0,
      });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: { message: (err as Error).message || 'Failed to load join info' } });
    }
  }
);

leagueJoinRouter.post(
  '/:leagueId/join',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const password = req.body?.password;
      const teamName = req.body?.team_name;

      if (typeof password !== 'string' || !password) {
        res.status(400).json({ error: { message: 'Password is required' } });
        return;
      }
      if (typeof teamName !== 'string' || teamName.trim().length < 3) {
        res.status(400).json({ error: { message: 'Team name must be at least 3 characters' } });
        return;
      }

      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }

      const { rows: memberRows } = await adminPool.query(
        `SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`,
        [league.id, req.userId]
      );
      if (memberRows.length > 0) {
        res.json({ league_id: league.id, already_member: true });
        return;
      }

      if (!league.join_password_hash) {
        res.status(400).json({ error: { message: 'This league does not accept password joins' } });
        return;
      }

      const ok = await bcrypt.compare(password, league.join_password_hash);
      if (!ok) {
        res.status(400).json({ error: { message: 'Incorrect league password' } });
        return;
      }

      const leagueId = await runAsUser(req.userId!, async (client) => {
        const { rows } = await client.query(`SELECT join_league($1, $2) AS id`, [
          league.id,
          teamName.trim(),
        ]);
        return rows[0].id as string;
      });

      res.json({ league_id: leagueId, already_member: false });
    } catch (err) {
      const status = (err as { status?: number }).status || 400;
      const message = (err as Error).message || 'Failed to join league';
      // pg errors often include "error: " prefix via node-pg
      const clean = message.replace(/^error:\s*/i, '');
      res.status(status === 500 ? 400 : status).json({ error: { message: clean } });
    }
  }
);
