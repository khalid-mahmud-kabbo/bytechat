import crypto from 'crypto';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../../lib/prisma';
import { saveFile, storageMode } from '../../lib/storage';
import { requireAuth } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';

export { UPLOAD_DIR } from '../../lib/storage';

console.log(`[storage] uploads go to: ${storageMode === 's3' ? 'S3 / R2 bucket' : 'local ./uploads folder'}`);

// The file extension comes from the mime type, never from the user's file name
// (otherwise "evil.html" with an image mime type would be served as a web page).
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'application/zip': '.zip',
};

const baseMime = (mime: string) => mime.split(';')[0].trim().toLowerCase();

// memory storage: the buffer is then written to disk or pushed to the bucket by saveFile()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, baseMime(file.mimetype) in EXT_BY_MIME),
});

const toInt = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

const router = Router();

// requireAuth runs BEFORE multer so anonymous requests are rejected before reading any upload
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'No file, or this file type is not supported');

  const mimeType = baseMime(file.mimetype);
  const key = crypto.randomUUID() + EXT_BY_MIME[mimeType];
  const url = await saveFile(key, file.buffer, mimeType);

  let waveform: number[] = [];
  try {
    const parsed = JSON.parse(String(req.body.waveform ?? '[]'));
    if (Array.isArray(parsed)) {
      waveform = parsed.slice(0, 100).map((n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0))));
    }
  } catch {
    /* ignore a broken waveform */
  }

  const media = await prisma.media.create({
    data: {
      uploaderId: req.userId!,
      key,
      url,
      mimeType,
      size: file.size,
      fileName: file.originalname.slice(0, 200),
      width: toInt(req.body.width),
      height: toInt(req.body.height),
      durationMs: toInt(req.body.durationMs),
      waveform,
    },
  });
  res.json({ media });
});

export default router;
