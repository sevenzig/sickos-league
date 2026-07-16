import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminPool } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const TOKEN_TTL = '30d';

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
  created_at: string;
  is_platform_admin: boolean;
}) {
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    is_platform_admin: row.is_platform_admin === true,
  };
}

authRouter.post('/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: { message: 'Valid email and a password of at least 6 characters are required' } });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await adminPool.query(
      'INSERT INTO auth.users (email, encrypted_password) VALUES (LOWER($1), $2) RETURNING id, email, created_at, is_platform_admin',
      [email, hash]
    );
    const user = publicUser(rows[0]);
    res.json({ token: issueToken(user.id, user.email, user.is_platform_admin), user });
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: { message: 'An account with this email already exists' } });
      return;
    }
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const { rows } = await adminPool.query(
    'SELECT id, email, encrypted_password, created_at, is_platform_admin FROM auth.users WHERE email = LOWER($1)',
    [String(email ?? '')]
  );
  const row = rows[0];
  const ok = row && (await bcrypt.compare(String(password ?? ''), row.encrypted_password));
  if (!ok) {
    res.status(401).json({ error: { message: 'Invalid email or password' } });
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
    'SELECT id, email, created_at, is_platform_admin FROM auth.users WHERE id = $1',
    [req.userId]
  );
  if (!rows[0]) {
    res.status(401).json({ error: { message: 'User no longer exists' } });
    return;
  }
  res.json({ user: publicUser(rows[0]) });
});
