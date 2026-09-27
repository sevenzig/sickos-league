import { Router } from 'express';
import { adminPool } from './db.js';
import { requireUser, type AuthedRequest } from './auth.js';

const MAX_TEAMS = 8;
const JOIN_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const JOIN_CODE_LEN = 8;
const JOIN_CODE_TTL_DAYS = 30;
const RETIRED_MSG =
  'Password join is retired. Ask your commissioner for the invite link (/invite/{CODE}).';

/** Resolve short 8-char prefix or full UUID to a league row (admin; no membership required). */
async function resolveLeague(
  leagueIdParam: string
): Promise<{
  id: string;
  name: string;
  season: number;
  draft_status: string;
  join_code: string | null;
  join_code_expires_at: Date | string | null;
} | null> {
  const id = leagueIdParam.trim();
  if (!id) return null;

  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    const { rows } = await adminPool.query(
      `SELECT id, name, season, draft_status, join_code, join_code_expires_at
       FROM leagues WHERE id = $1`,
      [id]
    );
    return rows[0] ?? null;
  }

  if (/^[a-zA-Z0-9]{8}$/.test(id)) {
    const { rows } = await adminPool.query(
      `SELECT id, name, season, draft_status, join_code, join_code_expires_at
       FROM leagues
       WHERE id::text ILIKE $1
       ORDER BY created_at ASC
       LIMIT 2`,
      [`${id}%`]
    );
    if (rows.length === 0) return null;
    if (rows.length > 1) {
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

function randomJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LEN; i++) {
    code += JOIN_CODE_CHARS.charAt(Math.floor(Math.random() * JOIN_CODE_CHARS.length));
  }
  return code;
}

function joinCodeStatus(
  code: string | null,
  expiresAt: Date | string | null
): 'active' | 'none' | 'expired' {
  if (!code) return 'none';
  if (expiresAt != null && new Date(expiresAt) <= new Date()) return 'expired';
  return 'active';
}

export const leagueJoinRouter = Router();

/** Owner: current join code (never exposed on public join-info). */
leagueJoinRouter.get(
  '/:leagueId/join-code',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }
      if (!(await assertOwner(league.id, req.userId!))) {
        res.status(403).json({ error: { message: 'Only the league owner can view the join code' } });
        return;
      }

      const status = joinCodeStatus(league.join_code, league.join_code_expires_at);
      res.json({
        code: league.join_code,
        expires_at: league.join_code_expires_at,
        status,
        invite_path: league.join_code ? `/invite/${league.join_code}` : null,
      });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({
        error: { message: (err as Error).message || 'Failed to load join code' },
      });
    }
  }
);

/** Owner: generate or rotate join code (30-day expiry). */
leagueJoinRouter.post(
  '/:leagueId/join-code',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }
      if (!(await assertOwner(league.id, req.userId!))) {
        res.status(403).json({
          error: { message: 'Only the league owner can generate a join code' },
        });
        return;
      }

      let code = '';
      let expiresAt: Date | null = null;
      for (let attempt = 0; attempt < 8; attempt++) {
        code = randomJoinCode();
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + JOIN_CODE_TTL_DAYS);
        try {
          await adminPool.query(
            `UPDATE leagues
             SET join_code = $2, join_code_expires_at = $3
             WHERE id = $1`,
            [league.id, code, expiresAt.toISOString()]
          );
          break;
        } catch (err) {
          const pgCode = (err as { code?: string }).code;
          if (pgCode === '23505' && attempt < 7) continue; // unique_violation
          throw err;
        }
      }

      res.json({
        code,
        expires_at: expiresAt?.toISOString() ?? null,
        invite_path: `/invite/${code}`,
        status: 'active' as const,
      });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({
        error: { message: (err as Error).message || 'Failed to set join code' },
      });
    }
  }
);

/** Owner: revoke join code (joining off until generate again). */
leagueJoinRouter.delete(
  '/:leagueId/join-code',
  requireUser,
  async (req: AuthedRequest, res) => {
    try {
      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }
      if (!(await assertOwner(league.id, req.userId!))) {
        res.status(403).json({
          error: { message: 'Only the league owner can revoke the join code' },
        });
        return;
      }

      await adminPool.query(
        `UPDATE leagues
         SET join_code = NULL, join_code_expires_at = NULL
         WHERE id = $1`,
        [league.id]
      );

      res.json({ ok: true, code: null, expires_at: null, status: 'none', invite_path: null });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({
        error: { message: (err as Error).message || 'Failed to revoke join code' },
      });
    }
  }
);

/** Retired: use multi-use join code instead. */
leagueJoinRouter.put('/:leagueId/join-password', requireUser, async (_req, res) => {
  res.status(410).json({ error: { message: RETIRED_MSG } });
});

/** Public metadata for the soft-retired /join page (no join code). */
leagueJoinRouter.get(
  '/:leagueId/join-info',
  async (req: AuthedRequest, res) => {
    try {
      const league = await resolveLeague(req.params.leagueId);
      if (!league) {
        res.status(404).json({ error: { message: 'League not found' } });
        return;
      }

      const { rows: countRows } = await adminPool.query(
        `SELECT COUNT(*)::int AS n FROM fantasy_teams WHERE league_id = $1`,
        [league.id]
      );

      let alreadyMember = false;
      if (req.userId) {
        const { rows: memberRows } = await adminPool.query(
          `SELECT 1 FROM league_members WHERE league_id = $1 AND user_id = $2`,
          [league.id, req.userId]
        );
        alreadyMember = memberRows.length > 0;
      }

      const teamCount = countRows[0]?.n ?? 0;
      const seatsRemaining = Math.max(0, MAX_TEAMS - teamCount);

      res.json({
        id: league.id,
        name: league.name,
        season: league.season,
        has_password: false,
        has_join_code: league.join_code != null,
        draft_status: league.draft_status,
        seats_remaining: seatsRemaining,
        already_member: alreadyMember,
      });
    } catch (err) {
      const status = (err as { status?: number }).status || 500;
      res.status(status).json({ error: { message: (err as Error).message || 'Failed to load join info' } });
    }
  }
);

/** Retired: password join is no longer a product path. */
leagueJoinRouter.post('/:leagueId/join', requireUser, async (_req, res) => {
  res.status(410).json({ error: { message: RETIRED_MSG } });
});
