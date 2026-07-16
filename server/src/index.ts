import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { attachUser, authRouter } from './auth.js';
import { rpcRouter } from './rpc.js';
import { tablesRouter } from './tables.js';
import { photosRouter, PHOTOS_DIR } from './photos.js';

const PORT = Number(process.env.PORT || 3001);

async function main() {
  await migrate();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(attachUser);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/rpc', rpcRouter);
  app.use('/api/db', tablesRouter);
  app.use('/api/photos', photosRouter);
  app.use('/photos', express.static(PHOTOS_DIR, { fallthrough: false }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: { message: err.message || 'Internal server error' } });
  });

  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
