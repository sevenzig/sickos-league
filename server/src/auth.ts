import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminPool } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const TOKEN_TTL = '30d';

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
