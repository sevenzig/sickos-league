import { createHash, randomBytes } from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminPool } from './db.js';
import { sendTransactionalEmail } from './email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const TOKEN_TTL = '30d';
const RESET_TTL_MS = 60 * 60 * 1000;
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const FORGOT_MESSAGE =
  'If an account exists for that username or email, we sent a reset link.';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
  isPlatformAdmin?: boolean;
}

/** Optional auth: attaches userId if a valid Bearer token is present. */
export function attachUser(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as jwt.JwtPayload;
      if (typeof payload.sub === 'string') {
        req.userId = payload.sub;
        req.userEmail = typeof payload.email === 'string' ? payload.email : undefined;
        req.isPlatformAdmin = payload.is_platform_admin === true;
      }
    } catch {
      // invalid/expired token -> treated as anonymous
    }
  }
  next();
}

export function requireUser(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: { message: 'Authentication required' } });
    return;
  }
  next();
}

export function requirePlatformAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: { message: 'Authentication required' } });
    return;
  }
  if (!req.isPlatformAdmin) {
    res.status(403).json({ error: { message: 'Platform admin required' } });
    return;
  }
  next();
}

function issueToken(userId: string, email: string, isPlatformAdmin: boolean) {
  return jwt.sign(
    { sub: userId, email, is_platform_admin: isPlatformAdmin },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

export const authRouter = Router();

function publicUser(row: {
  id: string;
  email: string;
  username: string | null;
  created_at: string;
  is_platform_admin: boolean;
}) {
  return {
    id: row.id,
    email: row.email,
    username: row.username ?? null,
    created_at: row.created_at,
    is_platform_admin: row.is_platform_admin === true,
  };
}

authRouter.post('/signup', async (req, res) => {
  const { email, username, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: { message: 'A valid email is required' } });
    return;
  }
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({
      error: { message: 'Username must be 3–32 characters: letters, numbers, or underscore' },
    });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await adminPool.query(
      `INSERT INTO auth.users (email, username, encrypted_password)
       VALUES (LOWER($1), LOWER($2), $3)
       RETURNING id, email, username, created_at, is_platform_admin`,
      [email, username, hash]
    );
    const user = publicUser(rows[0]);
    res.json({ token: issueToken(user.id, user.email, user.is_platform_admin), user });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      const detail = String((err as { detail?: string }).detail ?? '');
      const msg = detail.toLowerCase().includes('username')
        ? 'That username is already taken'
        : 'An account with this email already exists';
      res.status(409).json({ error: { message: msg } });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, username, password, identifier } = req.body ?? {};
  // Accept username OR email (also a combined `identifier` field from the UI).
  const raw =
    (typeof identifier === 'string' && identifier.trim()) ||
    (typeof email === 'string' && email.trim()) ||
    (typeof username === 'string' && username.trim()) ||
    '';
  const loginId = raw.toLowerCase();
  const byEmail = loginId.includes('@');

  const { rows } = await adminPool.query(
    byEmail
      ? `SELECT id, email, username, encrypted_password, created_at, is_platform_admin
         FROM auth.users WHERE email = $1`
      : `SELECT id, email, username, encrypted_password, created_at, is_platform_admin
         FROM auth.users WHERE LOWER(username) = $1`,
    [loginId]
  );
  const row = rows[0];
  const ok = row && (await bcrypt.compare(String(password ?? ''), row.encrypted_password));
  if (!ok) {
    res.status(401).json({ error: { message: 'Invalid username/email or password' } });
    return;
  }
  const user = publicUser(row);
  res.json({
    token: issueToken(user.id, user.email, user.is_platform_admin),
    user,
  });
});

function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

authRouter.post('/forgot-password', async (req, res) => {
  const raw = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  const loginId = raw.toLowerCase();
  if (!loginId) {
    res.json({ ok: true, message: FORGOT_MESSAGE });
    return;
  }

  const byEmail = loginId.includes('@');
  try {
    const { rows } = await adminPool.query(
      byEmail
        ? `SELECT id, email FROM auth.users WHERE email = $1`
        : `SELECT id, email FROM auth.users WHERE LOWER(username) = $1`,
      [loginId]
    );
    const user = rows[0] as { id: string; email: string } | undefined;
    if (user) {
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + RESET_TTL_MS);
      await adminPool.query(
        `UPDATE password_reset_tokens
         SET used_at = NOW()
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.id]
      );
      await adminPool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, tokenHash, expiresAt]
      );
      const link = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
      const sent = await sendTransactionalEmail(
        user.email,
        'Reset your BQBL password',
        `<p>Use this link to set a new password. It expires in 60 minutes.</p>
<p><a href="${link}">${link}</a></p>
<p>If you did not ask for this, you can ignore this email.</p>`
      );
      if (!sent.ok) {
        console.error('[auth] password reset email failed:', sent.error);
      }
    }
  } catch (err) {
    console.error('[auth] forgot-password failed:', err);
  }

  res.json({ ok: true, message: FORGOT_MESSAGE });
});

authRouter.post('/reset-password', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const password = req.body?.password;
  if (!token) {
    res.status(400).json({ error: { message: 'This reset link is invalid or has expired' } });
    return;
  }
  if (typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: { message: 'Password must be at least 6 characters' } });
    return;
  }

  const tokenHash = hashResetToken(token);
  const client = await adminPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT t.id AS token_id, t.expires_at, t.used_at,
              u.id, u.email, u.username, u.created_at, u.is_platform_admin
       FROM password_reset_tokens t
       JOIN auth.users u ON u.id = t.user_id
       WHERE t.token_hash = $1
       FOR UPDATE OF t`,
      [tokenHash]
    );
    const row = rows[0];
    const expired = row && new Date(row.expires_at).getTime() <= Date.now();
    if (!row || row.used_at || expired) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: { message: 'This reset link is invalid or has expired' } });
      return;
    }

    const hash = await bcrypt.hash(password, 10);
    await client.query(`UPDATE auth.users SET encrypted_password = $2 WHERE id = $1`, [
      row.id,
      hash,
    ]);
    const burned = await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL`,
      [row.token_id]
    );
    if (burned.rowCount !== 1) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: { message: 'This reset link is invalid or has expired' } });
      return;
    }
    await client.query('COMMIT');

    const user = publicUser(row);
    res.json({
      token: issueToken(user.id, user.email, user.is_platform_admin),
      user,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

authRouter.get('/me', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { message: 'Not signed in' } });
    return;
  }
  const { rows } = await adminPool.query(
    'SELECT id, email, username, created_at, is_platform_admin FROM auth.users WHERE id = $1',
    [req.userId]
  );
  if (!rows[0]) {
    res.status(401).json({ error: { message: 'User no longer exists' } });
    return;
  }
  res.json({ user: publicUser(rows[0]) });
});
