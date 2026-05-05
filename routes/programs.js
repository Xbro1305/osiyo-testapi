import express from 'express';
import Program from '../models/Program.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const programs = await Program.find().sort({ createdAt: -1 }).lean();
    res.json(programs);
  } catch (err) {
    console.error('Get programs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await Program.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
    res.json(result);
  } catch (err) {
    console.error('Save program error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Program.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete program error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
