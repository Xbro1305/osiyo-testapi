import express from 'express';
import Machine from '../models/Machine.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const machines = await Machine.find().sort({ name: 1 }).lean();
    res.json(machines);
  } catch (err) {
    console.error('Get machines error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await Machine.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
    res.json(result);
  } catch (err) {
    console.error('Save machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Machine.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete machine error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
