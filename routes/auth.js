import express from 'express';
import User from '../models/User.js';
import { authenticate, issueToken } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login — exchange login+passcode for a JWT.
router.post('/login', async (req, res) => {
  try {
    const { login, passcode } = req.body || {};
    if (!login || !passcode) {
      return res.status(400).json({ error: 'login and passcode are required' });
    }
    // Find by login (case-sensitive). active=true to lock out disabled users.
    const user = await User.findOne({ login, active: true });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await user.verifyPasscode(passcode);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueToken(user);

    // Return token + a sanitized user object (no passcode hash).
    const safeUser = user.toObject();
    delete safeUser.passcode;
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me — return current user from token. Used on app load to
// re-hydrate the session after a page refresh.
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.sub, active: true }).lean();
    if (!user) return res.status(401).json({ error: 'User not found or inactive' });
    delete user.passcode;
    return res.json({ user });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
