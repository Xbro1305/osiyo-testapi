import mongoose from 'mongoose';

// ===== Cash Book transaction =====
// One row of the safe / daily-cash ledger. Mirrors the store models' shape:
// a client-generated string `id` is the upsert key, and every record carries
// three independent money buckets so a single entry can be split across cash
// (UZS), USD, and card/plastik (UZS) — exactly like the cashier's Excel.
//
// direction:  "in"  = income into the safe
//             "out" = expense out of the safe
//             "opening" = the starting balance ("Qoldiq"); added like income
//                          but excluded from income/expense analytics.
//
// createdAt is the CLIENT's Date.now() (a Number) used only as a sort
// tiebreaker — that's why we don't use Mongoose's { timestamps: true } here
// (it would overwrite it with a Date).
//
// strict:false keeps this schemaless-friendly: any future field the app adds
// (e.g. `ownerId` when per-owner privacy is turned on) is persisted without a
// model change — same spirit as the rest of this backend.
const cashTxSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    direction: { type: String, default: 'in' }, // "in" | "out" | "opening"
    category: { type: String, default: '' },
    note: { type: String, default: '' },
    sum: { type: Number, default: 0 }, // UZS cash
    usd: { type: Number, default: 0 }, // USD
    card: { type: Number, default: 0 }, // UZS card / plastik
    operator: { type: String, default: '' },
    createdAt: { type: Number }, // client Date.now()

    // ===== Per-owner privacy =====
    // The user id (from the JWT `sub`) that created the row. The API scopes
    // every read/write/delete to the caller's own ownerId, so a cashier's safe
    // ledger is visible ONLY to that cashier — not to the super admin or anyone
    // else, at the application layer. (See the honesty note in routes/cash.js:
    // whoever controls the database can still read it directly; this scoping is
    // app-level, not encryption.)
    ownerId: { type: String, index: true },
  },
  { strict: false },
);

// Speeds up the ledger's date-range filtering and the default date sort,
// scoped per owner.
cashTxSchema.index({ ownerId: 1, date: -1 });

export default mongoose.model('CashTx', cashTxSchema);
