import express from 'express';
import Trash from '../models/Trash.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

const router = express.Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const q = parseListQuery(req);
    const projection = buildProjection(q.fields);

    let query = Trash.find().sort({ deletedAt: -1 });
    if (projection) query = query.select(projection);

    if (q.paginated) {
      const [items, total] = await Promise.all([
        query.skip(q.offset).limit(q.limit).lean(),
        Trash.countDocuments(),
      ]);
      return respondList(res, items, total, q);
    }
    const items = await query.lean();
    return respondList(res, items, items.length, q);
  } catch (err) {
    console.error('Get trash error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await Trash.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
    res.json(result);
  } catch (err) {
    console.error('Save trash error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Trash.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete trash error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
