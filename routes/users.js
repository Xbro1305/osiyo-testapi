import express from 'express';
import User from '../models/User.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// GET /api/users — all users (admin sees everyone, others see themselves).
// We strip passcode hashes from every response.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { id: req.user.sub };
    const users = await User.find(filter).select('-passcode').sort({ name: 1 }).lean();
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/users — create or update a user. Admin only.
// If passcode is sent, it'll be hashed by the pre-save hook in the model.
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { id, name, login, passcode, role, departmentId, stationId, allowedPages, active } = req.body || {};
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
      user.allowedPages = allowedPages || [];
      user.active = active !== false;
      // Only update passcode if a non-empty value was sent — otherwise keep the existing hash.
      if (passcode && String(passcode).trim()) user.passcode = passcode;
    } else {
      if (!passcode) return res.status(400).json({ error: 'passcode is required for new users' });
      user = new User({ id, name, login, passcode, role, departmentId, stationId, allowedPages, active: active !== false });
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
