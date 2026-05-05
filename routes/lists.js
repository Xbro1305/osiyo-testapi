import express from 'express';
import ConfigLists from '../models/ConfigLists.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/lists — return the lists object directly (or {} if not yet seeded).
router.get('/', async (req, res) => {
  try {
    const config = await ConfigLists.findOne().sort({ createdAt: -1 }).lean();
    res.json(config?.data || {});
  } catch (err) {
    console.error('Get lists error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/lists — replace the lists config (whole-object PUT semantics).
router.post('/', async (req, res) => {
  try {
    let config = await ConfigLists.findOne();
    if (config) {
      config.data = req.body || {};
      await config.save();
    } else {
      config = await ConfigLists.create({ data: req.body || {} });
    }
    res.json(config.data);
  } catch (err) {
    console.error('Save lists error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
