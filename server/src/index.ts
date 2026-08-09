import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { migrate } from './db.js';
import { attachUser, authRouter } from './auth.js';
import { rpcRouter } from './rpc.js';
import { tablesRouter } from './tables.js';
import { photosRouter, PHOTOS_DIR } from './photos.js';
import { leagueJoinRouter } from './leagueJoin.js';
import { startEmailWorkers } from './email.js';

const PORT = Number(process.env.PORT || 3001);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
  });
}

async function main() {
  await migrate();

  const app = express();
  // Vite proxy (and reverse proxies) set X-Forwarded-For; needed so rate
  // limits key on the browser IP instead of the proxy's localhost address.
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(attachUser);

  const isProd = process.env.NODE_ENV === 'production';
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    // Local/dev: Vite proxy + repeated signup/login testing exhausts a tiny bucket fast.
    max: isProd ? 30 : 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Too many auth attempts, try again later' } },
  });
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isProd ? 300 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { message: 'Rate limit exceeded' } },
  });

  app.get('/', (_req, res) => {
    res.json({
      ok: true,
      service: 'sickos-league-api',
      health: '/api/health',
      app: process.env.APP_BASE_URL || 'http://localhost:5173',
    });
  });
  app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api', apiLimiter);
  app.use('/api/rpc', rpcRouter);
  app.use('/api/db', tablesRouter);
  app.use('/api/photos', photosRouter);
  app.use('/api/leagues', leagueJoinRouter);
  app.use('/photos', express.static(PHOTOS_DIR, { fallthrough: false }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    res.status(500).json({ error: { message: err.message || 'Internal server error' } });
  });

  startEmailWorkers();
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  process.exit(1);
});
