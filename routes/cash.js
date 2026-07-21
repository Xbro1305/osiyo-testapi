import express from 'express';
import CashTx from '../models/CashTx.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

// Cash Book (safe ledger) API. Same CRUD + pagination pattern as routes/store.js
// — one collection, upsert on the client-generated `id`, delete by `id`.
// Mounted at /api/cash, so the single sub-router lives at /api/cash/tx, which
// is exactly what the frontend calls (GET/POST /cash/tx, DELETE /cash/tx/:id).
//
// ===== Per-owner privacy =====
// Every request is scoped to the CALLER's own user id (req.user.sub, set by the
// authenticate middleware from the JWT). A user only ever sees, edits, or
// deletes the cash rows they created. This means the cash book of a warehouse
// cashier is invisible to the super admin and everyone else THROUGH THE APP.
//
// Honesty note: this is application-level access control, not encryption.
// Whoever administers the MongoDB database (typically the same person running
// the server) can still read the raw `cashtxes` collection directly. To hide
// data even from the server owner you'd need client-side encryption (the
// "vault" approach) — a separate, larger change.

function ownerCrudRouter(Model, name) {
  const r = express.Router();
  r.use(authenticate);

  // List — only the caller's own rows.
  r.get('/', async (req, res) => {
    try {
      const ownerId = req.user.sub;
      const q = parseListQuery(req);
      const projection = buildProjection(q.fields);

      let query = Model.find({ ownerId }).sort({ date: -1 });
      if (projection) query = query.select(projection);

      if (q.paginated) {
        const [items, total] = await Promise.all([
          query.skip(q.offset).limit(q.limit).lean(),
          Model.countDocuments({ ownerId }),
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

  // Upsert — force ownerId to the caller; match on {id, ownerId} so a caller
  // can never overwrite (or hijack) another user's row by guessing its id.
  r.post('/', async (req, res) => {
    try {
      const ownerId = req.user.sub;
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const doc = { ...req.body, ownerId };
      delete doc._id;
      const result = await Model.findOneAndUpdate({ id, ownerId }, doc, {
        upsert: true,
        new: true,
      }).lean();
      res.json(result);
    } catch (err) {
      console.error(`Save ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Delete — only your own row.
  r.delete('/:id', async (req, res) => {
    try {
      const ownerId = req.user.sub;
      await Model.deleteOne({ id: req.params.id, ownerId });
      res.json({ success: true });
    } catch (err) {
      console.error(`Delete ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return r;
}

const router = express.Router();
router.use('/tx', ownerCrudRouter(CashTx, 'cash-tx'));

export default router;
