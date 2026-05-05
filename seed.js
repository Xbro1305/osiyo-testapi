// Load env BEFORE any other imports — see server.js / load-env.js for full
// explanation. ES modules import depth-first, so a separate loader module
// is the only reliable way to ensure dotenv.config() runs before models
// or middleware read process.env at their top level.
import './load-env.js';

import mongoose from 'mongoose';
import User from './models/User.js';
import ConfigLists from './models/ConfigLists.js';

// Default lists. Mirrors DEFAULT_LISTS in the artifact so that fresh installs
// have sensible dropdowns from day one.
const DEFAULT_LISTS = {
  fabricSource: ['Local Mill A', 'Local Mill B', 'Imported - Turkey', 'Imported - China'],
  fabricType: ['Cotton 100%', 'Cotton/Poly 65/35', 'Polyester 100%', 'Viscose', 'Linen Blend'],
  shift: ['Shift A (Morning)', 'Shift B (Afternoon)', 'Shift C (Night)'],
  gas: ['GAS', 'NO GAS'],
  bleachType: ['Hydrogen Peroxide', 'Optical Brightener', 'Standard Bleach'],
  bleachMachine: ['Bleach Machine 1', 'Bleach Machine 2'],
  batchingMachine: ['Batcher 1', 'Batcher 2', 'A-Frame 1', 'A-Frame 2'],
  width: ['150cm', '160cm', '180cm', '220cm', '240cm'],
  printingMachine: ['Rotary Print 1'],
  programType: ['Reactive', 'Pigment', 'Disperse', 'Sublimation'],
  printingStatus: ['Completed', 'Not Completed', 'On Hold', 'Reprint Needed'],
  curingStatus: ['Completed', 'Not Completed'],
  finishingMachine: ['Stenter 1', 'Stenter 2'],
  handFeel: ['Soft', 'Medium', 'Stiff', 'Crispy'],
  chemicalRecipe: ['Recipe A - Standard', 'Recipe B - Soft', 'Recipe C - Anti-pilling'],
  calenderingMachine: ['Calender 1', 'Calender 2'],
  foldingMachine: ['Folding Machine 1', 'Folding Machine 2'],
  rollingType: ['A-Frame', '50m Roll', '100m Roll', 'Plait'],
  dispatchDestination: ['Customer A', 'Customer B', 'Customer C', 'Internal Warehouse'],
  dispatchPerson: ['Driver 1', 'Driver 2', 'Driver 3'],
  maintenanceShift: ['Shift A', 'Shift B', 'Shift C', 'Maintenance Team'],
  breakdownType: ['Mechanical', 'Electrical', 'Software', 'Wear & Tear', 'Operator Error'],
  dailyCheckResult: ['OK', 'Minor issue', 'Needs attention', 'Stop machine'],
  grayFabricSource: ['OSIYO', 'ORZU', 'FROM OUTSIDE'],
  grayOutDestination: ['Sold to outside', 'Returned to OSIYO', 'Returned to ORZU', 'Internal transfer', 'Write-off'],
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ MongoDB connected');

    // Default super-admin. Passcode 'admin' will be hashed by the pre-save hook.
    const adminExists = await User.findOne({ login: 'admin' });
    if (!adminExists) {
      const u = new User({
        id: 'admin',
        name: 'Super Admin',
        login: 'admin',
        passcode: 'admin', // hashed automatically on save
        role: 'admin',
        active: true,
      });
      await u.save();
      console.log('✓ Default admin created (login: admin, passcode: admin) — CHANGE THIS in production');
    } else {
      console.log('✓ Admin user already exists');
    }

    // Default lists
    const listsExist = await ConfigLists.findOne();
    if (!listsExist) {
      await ConfigLists.create({ data: DEFAULT_LISTS });
      console.log('✓ Default lists configuration created');
    } else {
      console.log('✓ Lists already exist');
    }

    console.log('✓ Seed completed');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
