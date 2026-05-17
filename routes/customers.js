import express from 'express';
import Customer from '../models/Customer.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

const router = express.Router();
router.use(authenticate);

// GET /api/customers
// Supports:
//   ?limit=N        — paginate, returns { items, total, limit, offset }
//   ?offset=N       — paginate offset
//   ?fields=a,b,c   — return only these fields (always includes `id`)
//
// Without ?limit, returns a plain array (legacy shape) so unmigrated callers
// keep working.
router.get('/', async (req, res) => {
  try {
    const q = parseListQuery(req);
    const projection = buildProjection(q.fields);

    let query = Customer.find().sort({ name: 1 });
    if (projection) query = query.select(projection);

    if (q.paginated) {
      const [items, total] = await Promise.all([
        query.skip(q.offset).limit(q.limit).lean(),
        Customer.countDocuments(),
      ]);
      return respondList(res, items, total, q);
    }
    const items = await query.lean();
    return respondList(res, items, items.length, q);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id is required' });
    const result = await Customer.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
    res.json(result);
  } catch (err) {
    console.error('Save customer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Customer.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
