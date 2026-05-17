import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import Design from '../models/Design.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

const router = express.Router();
router.use(authenticate);

// ============================================================================
//  File storage for design images
// ----------------------------------------------------------------------------
//  Strategy: write files to ./uploads/designs/<uuid>.<ext> and store ONLY the
//  URL ('/uploads/designs/<uuid>.<ext>') in the Design document's `imageUrl`
//  field. The legacy `imageData` field (base64 dataURL) stays on the schema
//  for backward compatibility with old records, but new uploads never use it.
//
//  The /uploads directory is served as static files in server.js, so the
//  returned URL is directly fetchable by the browser.
// ============================================================================

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'designs');

// Ensure the upload dir exists. Multer would fail otherwise on first request.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer storage — write directly to disk with a random filename.
// We don't use the original filename because it could contain anything
// (foreign chars, traversal attempts, duplicates). A UUID is collision-free.
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Preserve the original extension (after sanitizing).
    let ext = path.extname(file.originalname || '').toLowerCase();
    // Allow only common image extensions, fall back to .bin if unknown.
    if (!/^\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(ext)) ext = '.bin';
    const name = `${crypto.randomUUID()}${ext}`;
    cb(null, name);
  },
});

// 5 MB cap + image mimetype filter.
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
});

// POST /api/designs/upload — multipart/form-data with field name 'file'.
// Returns { imageUrl: '/uploads/designs/<filename>' }.
//
// Errors from multer (size limit, bad mimetype) come through as thrown errors.
// We catch them and translate to a 400 so the client can show a friendly message.
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Design upload error:', err.message);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded (field name must be "file")' });
    }
    // The URL the browser uses to fetch the file. Matches the static mount in server.js.
    const imageUrl = `/uploads/designs/${req.file.filename}`;
    return res.json({ imageUrl });
  });
});

// ============================================================================
//  CRUD on the Design collection
// ============================================================================

router.get('/', async (req, res) => {
  try {
    const q = parseListQuery(req);
    const projection = buildProjection(q.fields);

    let query = Design.find().sort({ createdAt: -1 });
    if (projection) query = query.select(projection);

    if (q.paginated) {
      const [items, total] = await Promise.all([
        query.skip(q.offset).limit(q.limit).lean(),
        Design.countDocuments(),
      ]);
      return respondList(res, items, total, q);
    }
    const items = await query.lean();
    return respondList(res, items, items.length, q);
  } catch (err) {
    console.error('Get designs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await Design.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
    res.json(result);
  } catch (err) {
    console.error('Save design error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    // If the design has an imageUrl pointing at our uploads dir, also delete the file
    // on disk so we don't accumulate orphans. Best-effort: errors here aren't fatal.
    try {
      const doc = await Design.findOne({ id: req.params.id }).lean();
      if (doc?.imageUrl && doc.imageUrl.startsWith('/uploads/designs/')) {
        const filename = path.basename(doc.imageUrl);
        const fullPath = path.join(UPLOAD_DIR, filename);
        fs.unlink(fullPath, () => { /* ignore — file may already be gone */ });
      }
    } catch (cleanupErr) {
      console.warn('Image cleanup skipped:', cleanupErr.message);
    }
    await Design.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete design error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
