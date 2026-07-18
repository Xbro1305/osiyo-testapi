// Load env BEFORE any other imports — see server.js / load-env.js for full
// explanation. ES modules import depth-first, so a separate loader module
// is the only reliable way to ensure dotenv.config() runs before models
// or middleware read process.env at their top level.
import "./load-env.js";

import mongoose from "mongoose";
import User from "./models/User.js";
import ConfigLists from "./models/ConfigLists.js";

// Default lists. Mirrors DEFAULT_LISTS in the artifact so that fresh installs
// have sensible dropdowns from day one.
const DEFAULT_LISTS = {
  fabricSource: [
    "Local Mill A",
    "Local Mill B",
    "Imported - Turkey",
    "Imported - China",
  ],
  fabricType: [
    "Cotton 100%",
    "Cotton/Poly 65/35",
    "Polyester 100%",
    "Viscose",
    "Linen Blend",
  ],
  shift: ["Shift A (Morning)", "Shift B (Afternoon)", "Shift C (Night)"],
  gas: ["GAS", "NO GAS"],
  bleachType: ["Hydrogen Peroxide", "Optical Brightener", "Standard Bleach"],
  bleachMachine: ["Bleach Machine 1", "Bleach Machine 2"],
  batchingMachine: ["Batcher 1", "Batcher 2", "A-Frame 1", "A-Frame 2"],
  width: ["150cm", "160cm", "180cm", "220cm", "240cm"],
  printingMachine: ["Rotary Print 1"],
  programType: ["Reactive", "Pigment", "Disperse", "Sublimation"],
  printingStatus: ["Completed", "Not Completed", "On Hold", "Reprint Needed"],
  curingStatus: ["Completed", "Not Completed"],
  finishingMachine: ["Stenter 1", "Stenter 2"],
  handFeel: ["Soft", "Medium", "Stiff", "Crispy"],
  chemicalRecipe: [
    "Recipe A - Standard",
    "Recipe B - Soft",
    "Recipe C - Anti-pilling",
  ],
  calenderingMachine: ["Calender 1", "Calender 2"],
  foldingMachine: ["Folding Machine 1", "Folding Machine 2"],
  rollingType: ["A-Frame", "50m Roll", "100m Roll", "Plait"],
  dispatchDestination: [
    "Customer A",
    "Customer B",
    "Customer C",
    "Internal Warehouse",
  ],
  dispatchPerson: ["Driver 1", "Driver 2", "Driver 3"],
  maintenanceShift: ["Shift A", "Shift B", "Shift C", "Maintenance Team"],
  breakdownType: [
    "Mechanical",
    "Electrical",
    "Software",
    "Wear & Tear",
    "Operator Error",
  ],
  dailyCheckResult: ["OK", "Minor issue", "Needs attention", "Stop machine"],
  grayFabricSource: ["OSIYO", "ORZU", "FROM OUTSIDE"],
  grayOutDestination: [
    "Sold to outside",
    "Returned to OSIYO",
    "Returned to ORZU",
    "Internal transfer",
    "Write-off",
  ],

  // ===== Local Market Store =====
  //
  // These were previously only seeded from the frontend defaults on first
  // run. Adding them here so the backend is the single source of truth for
  // fresh installs and re-seeds.
  paymentMethod: ["Cash", "Bank Transfer", "Card", "Mixed"],
  storeUnit: ["meters", "rolls", "kg", "pieces"],
  customerType: ["Retail", "Wholesale", "Reseller", "Tailor", "Other"],
  // "Correction" is for manual stock adjustments (e.g. a physical count
  // discovers extra/missing meters that don't tie to any dispatch or supplier).
  storeStockSource: [
    "From Production (Dispatch)",
    "External Supplier",
    "Return / Refurbished",
    "Correction",
  ],
  // Granular fabric-type list for the local market store. Separate from
  // `fabricType` above because the store sells finished fabric in commercial
  // categories that don't map 1:1 to what production tracks.
  //
  // v4 shape: each entry is { name, cost } — per-meter cost lives here, not
  // on individual stock-in records. The frontend reads cost via the helper
  // `getFabricCost(name, lists)` so legacy `string[]` entries still resolve
  // (their cost defaults to 0 until an operator edits the list).
  stockFabricType: [
    { name: "Plain Cotton", cost: 0 },
    { name: "Printed Cotton", cost: 0 },
    { name: "Cotton Satin", cost: 0 },
    { name: "Voile", cost: 0 },
    { name: "Crepe", cost: 0 },
    { name: "Chiffon", cost: 0 },
    { name: "Linen", cost: 0 },
    { name: "Polyester", cost: 0 },
    { name: "Mixed Blend", cost: 0 },
  ],
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ MongoDB connected");

    // Default super-admin. Passcode 'admin' will be hashed by the pre-save hook.
    const adminExists = await User.findOne({ login: "admin" });
    if (!adminExists) {
      const u = new User({
        id: "admin",
        name: "Super Admin",
        login: "admin",
        passcode: "admin", // hashed automatically on save
        role: "admin",
        active: true,
      });
      await u.save();
      console.log(
        "✓ Default admin created (login: admin, passcode: admin) — CHANGE THIS in production"
      );
    } else {
      console.log("✓ Admin user already exists");
    }

    // Default lists.
    //
    // Behaviour:
    //   - Fresh install (no ConfigLists doc) → create with the full DEFAULT_LISTS.
    //   - Existing install → MERGE missing keys in. User-customised lists are
    //     preserved (we never overwrite an existing key); only genuinely
    //     missing keys are added. This way re-running the seed after we add
    //     a new list (like `stockFabricType`) gives an upgrade path that
    //     doesn't clobber operator customisations.
    const listsExist = await ConfigLists.findOne();
    if (!listsExist) {
      await ConfigLists.create({ data: DEFAULT_LISTS });
      console.log("✓ Default lists configuration created");
    } else {
      const current = listsExist.data || {};
      const added = [];
      const migrated = [];
      for (const key of Object.keys(DEFAULT_LISTS)) {
        if (!Array.isArray(current[key]) || current[key].length === 0) {
          current[key] = DEFAULT_LISTS[key];
          added.push(key);
        }
      }
      // ===== v4 soft migration: stockFabricType =====
      //
      // Legacy entries are plain strings; v4 wants `{ name, cost }` objects.
      // If any entry is still a string, rewrap it as { name: <string>, cost: 0 }
      // so the operator can edit the cost in Lists admin without losing their
      // custom fabric type names. Idempotent — re-runs do nothing.
      if (Array.isArray(current.stockFabricType)) {
        let touched = false;
        current.stockFabricType = current.stockFabricType.map((entry) => {
          if (typeof entry === "string") {
            touched = true;
            return { name: entry, cost: 0 };
          }
          return entry;
        });
        if (touched) migrated.push("stockFabricType");
      }
      if (added.length || migrated.length) {
        listsExist.data = current;
        listsExist.markModified("data");
        await listsExist.save();
        if (added.length) {
          console.log(
            `✓ Lists updated — added missing keys: ${added.join(", ")}`
          );
        }
        if (migrated.length) {
          console.log(`✓ Lists migrated to v4 shape: ${migrated.join(", ")}`);
        }
      } else {
        console.log("✓ Lists already up to date");
      }
      // Also patch existing storeStockSource if it's there but missing
      // the new "Correction" value. (This is the one upgrade we DO apply
      // even to an existing key, because adding to a list is non-destructive.)
      if (
        Array.isArray(current.storeStockSource) &&
        !current.storeStockSource.includes("Correction")
      ) {
        current.storeStockSource.push("Correction");
        listsExist.data = current;
        listsExist.markModified("data");
        await listsExist.save();
        console.log('✓ Added "Correction" to storeStockSource');
      }
    }

    console.log("✓ Seed completed");
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seed();
