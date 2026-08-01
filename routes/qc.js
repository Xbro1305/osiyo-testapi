import express from 'express';
import {
  QcDefectCode,
  QcDefectLog,
  QcFishbone,
  QcFiveWhy,
  QcPfmea,
  QcEightD,
} from '../models/Qc.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

// Quality & R&D station. Six parallel CRUD collections under /api/qc/*, all
// authenticated and sharing the same upsert-by-id pattern as the store routes.
// Frontend prefixes → paths:
//   qc_defcode:  → /api/qc/defcode
//   qc_deflog:   → /api/qc/deflog
//   qc_fishbone: → /api/qc/fishbone
//   qc_5why:     → /api/qc/fivewhy
//   qc_pfmea:    → /api/qc/pfmea
//   qc_8d:       → /api/qc/eightd

function crudRouter(Model, name) {
  const r = express.Router();
  r.use(authenticate);

  r.get('/', async (req, res) => {
    try {
      const q = parseListQuery(req);
      const projection = buildProjection(q.fields);

      let query = Model.find().sort({ createdAt: -1 });
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
      const result = await Model.findOneAndUpdate({ id }, req.body, {
        upsert: true,
        new: true,
      }).lean();
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
router.use('/defcode', crudRouter(QcDefectCode, 'qc-defcode'));
router.use('/deflog', crudRouter(QcDefectLog, 'qc-deflog'));
router.use('/fishbone', crudRouter(QcFishbone, 'qc-fishbone'));
router.use('/fivewhy', crudRouter(QcFiveWhy, 'qc-fivewhy'));
router.use('/pfmea', crudRouter(QcPfmea, 'qc-pfmea'));
router.use('/eightd', crudRouter(QcEightD, 'qc-eightd'));

export default router;
