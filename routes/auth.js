// ============================================================================
//  routes/auth.js — login, session hydration, self-service passcode change.
//
//  Mounted in server.js as:  app.use('/api/auth', authRoutes);
//
//  NOTE: this file is rebuilt from the version we wrote earlier (login + me).
//  Diff it against what is on the server before replacing:
//      diff routes/auth.js ~/auth.js
//  If yours has extra routes, keep them and copy only the change-passcode
//  block at the bottom.
// ============================================================================

import express from "express";
import User from "../models/User.js";
import { authenticate, issueToken } from "../middleware/auth.js";

const router = express.Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login — exchange login + passcode for a JWT.
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { login, passcode } = req.body || {};
    if (!login || !passcode) {
      return res.status(400).json({ error: "login and passcode are required" });
    }

    // Find by login (case-sensitive). active:true locks out disabled users.
    const user = await User.findOne({ login, active: true });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await user.verifyPasscode(passcode);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = issueToken(user);

    // Return token + a sanitized user object (never the passcode hash).
    const safeUser = user.toObject();
    delete safeUser.passcode;
    return res.json({ token, user: safeUser });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/me — return the current user from the token. Used on app load
// to re-hydrate the session after a page refresh.
// ---------------------------------------------------------------------------
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.sub, active: true }).lean();
    if (!user) {
      return res.status(401).json({ error: "User not found or inactive" });
    }
    delete user.passcode;
    return res.json({ user });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-passcode — a signed-in user changes their OWN
// passcode. The target is always req.user.sub from the JWT, never a value
// from the request body, so this can't be pointed at someone else's account.
//
// WHY A DEDICATED ROUTE INSTEAD OF POST /users:
//   the users route upserts the whole document. If it does that with
//   findOneAndUpdate(), Mongoose's pre('save') hook never fires, so the
//   passcode lands in the database as PLAINTEXT while login still compares
//   with bcrypt — the account is then permanently locked out. Assigning the
//   field and calling .save() is what makes the hashing hook run.
//
// WHY 400 AND NOT 401 FOR A WRONG CURRENT PASSCODE:
//   the frontend's apiFetch treats any 401 as "your session is dead", clears
//   the token and bounces to the login screen. A typo in the current passcode
//   should show an inline error, not sign the user out.
// ---------------------------------------------------------------------------
router.post("/change-passcode", authenticate, async (req, res) => {
  try {
    const { currentPasscode, newPasscode } = req.body || {};

    if (!currentPasscode || !newPasscode) {
      return res
        .status(400)
        .json({ error: "currentPasscode and newPasscode are required" });
    }
    if (String(newPasscode).length < 4) {
      return res
        .status(400)
        .json({ error: "New passcode must be at least 4 characters" });
    }
    if (String(currentPasscode) === String(newPasscode)) {
      return res
        .status(400)
        .json({ error: "New passcode must be different from the current one" });
    }

    // NOT .lean() — we need a real document so .save() runs the hash hook.
    const user = await User.findOne({ id: req.user.sub, active: true });
    if (!user) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    const ok = await user.verifyPasscode(currentPasscode);
    if (!ok) {
      // 400 on purpose — see the block comment above.
      return res.status(400).json({ error: "Current passcode is incorrect" });
    }

    user.passcode = newPasscode;
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("Change passcode error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;
