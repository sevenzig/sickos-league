import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { adminPool } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-me';
const TOKEN_TTL = '30d';

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
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

function issueToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || password.length < 6) {
    res.status(400).json({ error: { message: 'Valid email and a password of at least 6 characters are required' } });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await adminPool.query(
      'INSERT INTO auth.users (email, encrypted_password) VALUES (LOWER($1), $2) RETURNING id, email, created_at',
      [email, hash]
    );
    const user = rows[0];
    res.json({ token: issueToken(user.id, user.email), user });
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
    'SELECT id, email, encrypted_password, created_at FROM auth.users WHERE email = LOWER($1)',
    [String(email ?? '')]
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(String(password ?? ''), user.encrypted_password));
  if (!ok) {
    res.status(401).json({ error: { message: 'Invalid email or password' } });
    return;
  }
  res.json({
    token: issueToken(user.id, user.email),
    user: { id: user.id, email: user.email, created_at: user.created_at },
  });
});

authRouter.get('/me', async (req: AuthedRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: { message: 'Not signed in' } });
    return;
  }
  const { rows } = await adminPool.query(
    'SELECT id, email, created_at FROM auth.users WHERE id = $1',
    [req.userId]
  );
  if (!rows[0]) {
    res.status(401).json({ error: { message: 'User no longer exists' } });
    return;
  }
  res.json({ user: rows[0] });
});
