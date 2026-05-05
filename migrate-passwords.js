// Load env BEFORE any other imports — see server.js / load-env.js for full
// explanation.
import './load-env.js';

import mongoose from 'mongoose';
import User from './models/User.js';

// One-time migration: any user document whose passcode is NOT already a bcrypt
// hash gets hashed in place. Safe to run multiple times — already-hashed users
// are skipped (the regex excludes them).
//
// Run with: npm run migrate-passwords
async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected');

    const users = await User.find({});
    console.log(`Found ${users.length} users.`);

    let hashed = 0;
    let skipped = 0;
    for (const u of users) {
      // Already a bcrypt hash? Skip.
      if (typeof u.passcode === 'string' && /^\$2[aby]\$/.test(u.passcode)) {
        skipped += 1;
        continue;
      }
      // Calling .save() triggers the pre-save hook in User.js which hashes.
      // The hook detects "not yet hashed" via the same regex.
      u.markModified('passcode');
      await u.save();
      hashed += 1;
      console.log(`  ✓ Hashed passcode for ${u.login}`);
    }

    console.log(`✓ Migration done. Hashed: ${hashed}, already hashed (skipped): ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  }
}

migrate();
