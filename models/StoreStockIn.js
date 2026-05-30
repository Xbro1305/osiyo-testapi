import mongoose from 'mongoose';

// ===== Roll line sub-schema =====
// Used when `unit === "rolls"`. A single stock-in record can include
// multiple roll lines (e.g. 34 × 30m + 23 × 50m) plus an optional
// `extraMeters` bulk piece. Total meters = sum(length×qty) + extraMeters.
//
// We do NOT add a default _id to roll lines — they're keyed by array
// position. Adding _id would clutter every line with a Mongo ObjectId we
// never reference.
const rollLineSchema = new mongoose.Schema(
  {
    length: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
  },
  { _id: false },
);

const storeStockInSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    date: { type: String, required: true },

    // ----- Source / lot / unit -----
    source: { type: String },            // List value, includes "Correction" since v2.
    lotNumber: { type: String },
    unit: { type: String },              // "meters" | "rolls" | "kg" | "pieces"

    // ----- Fabric classification -----
    //
    // `fabricType` is the legacy production fabric type (kept for back-compat;
    // older records may only have this). `stockFabricType` is the new
    // store-specific list (commercial categories). Both are optional so
    // legacy records keep validating.
    fabricType: { type: String },
    stockFabricType: { type: String },

    // ----- Fabric state + variant -----
    //
    // `fabricState` describes the incoming fabric's finish. Today only
    // "printed" and "dyed" are supported on the form; older records leave
    // this null.
    //
    // Exactly one of `designId` / `hexColor` is meaningful at a time,
    // determined by `fabricState`. Both fields are optional and may stay
    // null for legacy records. `designId` value "mix" is a sentinel meaning
    // "multiple designs in this stock-in".
    fabricState: { type: String },       // "printed" | "dyed" | undefined
    designId: { type: String },          // Design._id or "mix"
    hexColor: { type: String },          // "#RRGGBB"

    // ----- Quantity entry -----
    //
    // For new records the frontend always populates `qty` to the computed
    // total (sum of rollLines + extraMeters when unit=rolls; raw input when
    // unit=meters), so any consumer that reads `qty` keeps working without
    // change. `rollLines` and `extraMeters` are the source-of-truth fields
    // for the rich shape; `qty` is the cached total.
    rollLines: { type: [rollLineSchema], default: [] },
    extraMeters: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },

    // ----- Cost -----
    //
    // `costPerMeter` is the canonical cost field as of v2 (frontend asked
    // for per-meter pricing regardless of unit). `costPrice` is the legacy
    // alias — the frontend mirrors costPerMeter into costPrice on save so
    // older readers keep working.
    costPerMeter: { type: Number, default: 0 },
    costPrice: { type: Number, default: 0 },

    // ----- Misc -----
    notes: { type: String },
    operator: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model('StoreStockIn', storeStockInSchema);
