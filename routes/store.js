import express from 'express';
import StoreSale from '../models/StoreSale.js';
import StorePayment from '../models/StorePayment.js';
import StoreStockIn from '../models/StoreStockIn.js';
import { authenticate } from '../middleware/auth.js';

// Three parallel sub-routers under /api/store/{sales,payments,stockin}.
// All use the same CRUD pattern; we factor that into a small helper.

function crudRouter(Model, name) {
  const r = express.Router();
  r.use(authenticate);

  r.get('/', async (req, res) => {
    try {
      const rows = await Model.find().sort({ date: -1 }).lean();
      res.json(rows);
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

// Mounted at /api/store — the three sub-paths /sales /payments /stockin.
const router = express.Router();
router.use('/sales', crudRouter(StoreSale, 'store-sale'));
router.use('/payments', crudRouter(StorePayment, 'store-payment'));
router.use('/stockin', crudRouter(StoreStockIn, 'store-stockin'));

export default router;
