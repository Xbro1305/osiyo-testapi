import express from 'express';
import StoreSale from '../models/StoreSale.js';
import StorePayment from '../models/StorePayment.js';
import StoreStockIn from '../models/StoreStockIn.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

// Three parallel sub-routers under /api/store/{sales,payments,stockin}.
// All use the same CRUD pattern with pagination; we factor that into a small helper.

function crudRouter(Model, name) {
  const r = express.Router();
  r.use(authenticate);

  r.get('/', async (req, res) => {
    try {
      const q = parseListQuery(req);
      const projection = buildProjection(q.fields);

      let query = Model.find().sort({ date: -1 });
      if (projection) query = query.select(projection);

      if (q.paginated) {
        const [items, total] = await Promise.all([
          query.skip(q.offset).limit(q.limit).lean(),
          Model.countDocuments(),
        ]);
        return respondList(res, items, total, q);
      }
      const items = await query.lean();
      return respondList(res, items, items.length, q);
    } catch (err) {
      console.error(`Get ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  r.post('/', async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const result = await Model.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
      res.json(result);
    } catch (err) {
      console.error(`Save ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  r.delete('/:id', async (req, res) => {
    try {
      await Model.deleteOne({ id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(`Delete ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return r;
}

const router = express.Router();
router.use('/sales', crudRouter(StoreSale, 'store-sale'));
router.use('/payments', crudRouter(StorePayment, 'store-payment'));
router.use('/stockin', crudRouter(StoreStockIn, 'store-stockin'));

export default router;
