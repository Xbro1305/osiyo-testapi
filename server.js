// Load environment variables BEFORE any other import. The `./load-env.js`
// module calls dotenv.config() during its evaluation, and Node guarantees
// that an imported module is fully evaluated before the next import in the
// importing file is resolved. So by the time we import express/cors/routes
// below, process.env is fully populated and modules that read process.env
// at the top level (like middleware/auth.js) will see the correct values.
//
// DO NOT MOVE THIS IMPORT. Keep it on line 1, before everything else.
import './load-env.js';

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';

import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import listsRoutes from './routes/lists.js';
import designsRoutes from './routes/designs.js';
import machinesRoutes from './routes/machines.js';
import recordsRoutes from './routes/records.js';
import programsRoutes from './routes/programs.js';
import customersRoutes from './routes/customers.js';
import storeRoutes from './routes/store.js';
import cashRoutes from './routes/cash.js';
import qcRoutes from './routes/qc.js';
import configRoutes from './routes/config.js';
import trashRoutes from './routes/trash.js';
import statsRoutes from './routes/stats.js';

const app = express();
const PORT = process.env.PORT || 5000;

// CORS — if CORS_ORIGINS env is set, allowlist those; otherwise allow all (dev).
const corsOriginsEnv = process.env.CORS_ORIGINS;
const corsOptions = corsOriginsEnv
  ? { origin: corsOriginsEnv.split(',').map(s => s.trim()), credentials: true }
  : { origin: true, credentials: true };
app.use(cors(corsOptions));

// Body limit at 10mb to allow base64 design images on legacy POSTs.
// (New uploads use multipart via /api/designs/upload and don't hit this limit.)
app.use(express.json({ limit: '10mb' }));

// ============================================================================
//  Static file serving for uploaded images.
//
//  Designs uploaded via POST /api/designs/upload land under ./uploads/designs/
//  and are referenced from the DB as URL paths like "/uploads/designs/xyz.png".
//  Mounting express.static here makes those URLs directly fetchable.
//
//  We mkdir the directory at boot so a clean install doesn't fail on the
//  first upload, and so listing the directory in a file browser shows it
//  even before anything has been uploaded.
// ============================================================================
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
fs.mkdirSync(path.join(UPLOAD_ROOT, 'designs'), { recursive: true });
app.use('/uploads', express.static(UPLOAD_ROOT, {
  // Long cache life for uploaded files — they're effectively immutable since
  // we use UUID filenames; if you re-upload, you get a new filename.
  maxAge: '7d',
  fallthrough: true,
}));

// Health check — useful for uptime monitors and Render/Railway probes.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth routes (login, /me) — must be mounted BEFORE the authenticate middleware
// gates the rest, since /login is the way to get a token in the first place.
app.use('/api/auth', authRoutes);

// All other routes are protected — they apply the `authenticate` middleware
// internally. We mount them under /api so the frontend's API_BASE_URL can be
// just "/api" or the full backend URL.
app.use('/api/users', usersRoutes);
app.use('/api/lists', listsRoutes);
app.use('/api/designs', designsRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/programs', programsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/qc', qcRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/config', configRoutes);
app.use('/api/trash', trashRoutes);
app.use('/api/stats', statsRoutes);

// MongoDB connection — fail fast if URI missing.
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('✗ MONGODB_URI is not set. Set it in .env before starting.');
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✓ MongoDB connected');
    app.listen(PORT, () => console.log(`✓ Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('✗ MongoDB connection failed:', err.message);
    process.exit(1);
  });
