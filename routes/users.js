import express from 'express';
import User from '../models/User.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

const router = express.Router();
router.use(authenticate);

// GET /api/users — all users (admin sees everyone, others see themselves).
// We strip passcode hashes from every response.
//
// Supports the standard `?limit=`, `?offset=`, `?fields=` from the pagination
// helper. The passcode strip happens AFTER projection: if a caller asks for
// just `id,name` they don't get passcode either way; if they ask for the
// full document they still don't get passcode.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { id: req.user.sub };
    const q = parseListQuery(req);
    const projection = buildProjection(q.fields);

    let query = User.find(filter).sort({ name: 1 });
    if (projection) {
      // Even when projecting, exclude passcode.
      // Mongoose: you can combine inclusion-only projections with explicit exclusion of one field.
      // Easiest: append `-passcode` to the projection string.
      query = query.select(`${projection} -passcode`);
    } else {
      query = query.select('-passcode');
    }

    if (q.paginated) {
      const [items, total] = await Promise.all([
        query.skip(q.offset).limit(q.limit).lean(),
        User.countDocuments(filter),
      ]);
      return respondList(res, items, total, q);
    }
    const items = await query.lean();
    return respondList(res, items, items.length, q);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users — create or update a user. Admin only.
// If passcode is sent, it'll be hashed by the pre-save hook in the model.
router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      id, name, login, passcode, role,
      departmentId, stationId,
      allowedDepartments, allowedPages,
      active,
    } = req.body || {};
    if (!id || !name || !login || !role) {
      return res.status(400).json({ error: 'id, name, login, and role are required' });
    }

    // We can't use findOneAndUpdate because it bypasses the pre-save hash hook.
    // Find first, then either patch or create — both go through .save().
    let user = await User.findOne({ id });
    if (user) {
      user.name = name;
      user.login = login;
      user.role = role;
      user.departmentId = departmentId ?? null;
      user.stationId = stationId ?? null;
      user.allowedDepartments = Array.isArray(allowedDepartments) ? allowedDepartments : [];
      user.allowedPages = Array.isArray(allowedPages) ? allowedPages : [];
      user.active = active !== false;
      if (passcode && String(passcode).trim()) user.passcode = passcode;
    } else {
      if (!passcode) return res.status(400).json({ error: 'passcode is required for new users' });
      user = new User({
        id, name, login, passcode, role,
        departmentId, stationId,
        allowedDepartments: Array.isArray(allowedDepartments) ? allowedDepartments : [],
        allowedPages: Array.isArray(allowedPages) ? allowedPages : [],
        active: active !== false,
      });
    }
    await user.save();
    const out = user.toObject();
    delete out.passcode;
    res.json(out);
  } catch (err) {
    console.error('Save user error:', err);
    if (err.code === 11000) return res.status(409).json({ error: 'login already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id — admin only.
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await User.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
