import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireUser, type AuthedRequest } from './auth.js';

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
