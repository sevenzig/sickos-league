import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireUser, type AuthedRequest } from './auth.js';
import { adminPool } from './db.js';

export const PHOTOS_DIR = process.env.PHOTOS_DIR || path.resolve(process.cwd(), 'photos');

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // matches the old 1MB bucket limit
});

function userDir(userId: string): string {
  return path.join(PHOTOS_DIR, userId);
}

function removeExistingPhotos(userId: string): void {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith('profile.')) fs.unlinkSync(path.join(dir, file));
  }
}

export const photosRouter = Router();

photosRouter.post('/', requireUser, upload.single('file'), (req: AuthedRequest, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { message: 'No file provided (field name: file)' } });
    return;
  }
  const ext = EXT_BY_MIME[file.mimetype];
  if (!ext) {
    res.status(400).json({ error: { message: `Unsupported image type: ${file.mimetype}` } });
    return;
  }
  const userId = req.userId!;
  fs.mkdirSync(userDir(userId), { recursive: true });
  removeExistingPhotos(userId);
  fs.writeFileSync(path.join(userDir(userId), `profile.${ext}`), file.buffer);
  res.json({ url: `/photos/${userId}/profile.${ext}` });
});

photosRouter.delete('/', requireUser, (req: AuthedRequest, res) => {
  removeExistingPhotos(req.userId!);
  res.json({ success: true });
});

// --- Team logos (Phase 5.2): same storage pattern, keyed by fantasy team ----

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function teamDir(teamId: string): string {
  return path.join(PHOTOS_DIR, 'teams', teamId);
}

/** The team's manager or the league owner may change its logo. */
async function canEditTeam(teamId: string, userId: string): Promise<boolean> {
  const { rows } = await adminPool.query(
    `SELECT 1 FROM fantasy_teams ft
     WHERE ft.id = $1
       AND (ft.manager_user_id = $2 OR EXISTS(
            SELECT 1 FROM league_members lm
            WHERE lm.league_id = ft.league_id AND lm.user_id = $2 AND lm.role = 'owner'))`,
    [teamId, userId]
  );
  return rows.length > 0;
}

photosRouter.post('/team/:teamId', requireUser, upload.single('file'), async (req: AuthedRequest, res) => {
  const teamId = req.params.teamId;
  if (!UUID_RE.test(teamId)) {
    res.status(400).json({ error: { message: 'Invalid team id' } });
    return;
  }
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: { message: 'No file provided (field name: file)' } });
    return;
  }
  const ext = EXT_BY_MIME[file.mimetype];
  if (!ext) {
    res.status(400).json({ error: { message: `Unsupported image type: ${file.mimetype}` } });
    return;
  }
  if (!(await canEditTeam(teamId, req.userId!))) {
    res.status(403).json({ error: { message: 'Not authorized to change this team\'s logo' } });
    return;
  }

  const dir = teamDir(teamId);
  fs.mkdirSync(dir, { recursive: true });
  for (const existing of fs.readdirSync(dir)) {
    if (existing.startsWith('logo.')) fs.unlinkSync(path.join(dir, existing));
  }
  fs.writeFileSync(path.join(dir, `logo.${ext}`), file.buffer);

  const url = `/photos/teams/${teamId}/logo.${ext}`;
  await adminPool.query('UPDATE fantasy_teams SET logo_url = $1 WHERE id = $2', [url, teamId]);
  res.json({ url });
});
