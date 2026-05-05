import express from 'express';
import AppConfig from '../models/AppConfig.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/config/:key — fetch a singleton config object by key.
// Used for keys like 'numbering', 'prefs'.
router.get('/:key', async (req, res) => {
  try {
    const doc = await AppConfig.findOne({ key: req.params.key }).lean();
    res.json(doc?.data || null);
  } catch (err) {
    console.error('Get config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/config/:key — replace the whole config object for a key.
router.post('/:key', async (req, res) => {
  try {
    const result = await AppConfig.findOneAndUpdate(
      { key: req.params.key },
      { key: req.params.key, data: req.body || {} },
      { upsert: true, new: true }
    ).lean();
    res.json(result.data);
  } catch (err) {
    console.error('Save config error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
