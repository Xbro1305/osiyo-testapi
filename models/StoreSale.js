import mongoose from 'mongoose';

// ===== Roll line sub-schema =====
// Mirrors StoreStockIn's rollLineSchema. When a sale picks whole rolls from
// on-hand stock, each picked length+qty is captured here so the Current
// Stock view can compute on-hand-per-length exactly (stock-in adds; sales
// subtract per length).
const rollLineSchema = new mongoose.Schema(
  {
    length: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },
  },
  { _id: false },
);

const storeSaleSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    customerId: { type: String, required: true, index: true },

    // ----- Legacy fields kept for back-compat -----
    //
    // Older sales had only these. New records still populate `qty`
    // (= total meters sold) and `unitPrice` (= weighted-average final price
    // across fabric types) so downstream readers (ledger, reports, CSV
    // export) keep working without change. `fabricType` is the legacy
    // production fabricType; the new authoritative type is stockFabricType.
    fabricType: { type: String },
    qty: { type: Number, default: 0 },
    unit: { type: String },              // "rolls" for new picker-driven sales
    unitPrice: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paymentMethod: { type: String },
    invoiceNumber: { type: String },
    notes: { type: String },
    operator: { type: String },

    // ----- v3: variant fields (mirrors StoreStockIn) -----
    //
    // When the sale picker selects rolls from a design or color group,
    // these capture what was sold. fabricState + (designId | hexColor) form
    // the variant identity. `designId` value "mix" = multi-design rolls;
    // "remainder" = sold from the remainder bin. Both are sentinels in the
    // same string field so the grouping/joining code stays simple.
    //
    // `colorName` is the human-friendly label for dyed fabric (e.g. "Royal
    // Blue"), set alongside hexColor. Used as the display label in tables
    // and exports.
    fabricState: { type: String },       // "printed" | "dyed"
    designId: { type: String },          // Design._id | "mix" | "remainder"
    hexColor: { type: String },          // "#RRGGBB"
    colorName: { type: String },
    stockFabricType: { type: String },

    // ----- v3: roll-line capture -----
    //
    // For unit=rolls sales, the specific length×qty per roll. Pairing this
    // with StoreStockIn.rollLines lets Current Stock subtract per-length
    // exactly rather than guessing FIFO.
    rollLines: { type: [rollLineSchema], default: [] },
    extraMeters: { type: Number, default: 0 },

    // ----- v4: per-fabric-type discounts -----
    //
    // Sale prices are derived from each picked roll's stockFabricType cost
    // (read from ConfigLists.stockFabricType). The discount is per fabric
    // type — operators discount Plain Cotton differently from Cotton Satin
    // for the same customer. Stored as { fabricTypeName: discountPerMeter }.
    //
    // Mixed type because Mongoose's Map type is strict about keys; we'd
    // need to enable strict: false on it. Plain object map is simpler and
    // the keys are operator-defined strings anyway.
    discountsByFabric: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export default mongoose.model('StoreSale', storeSaleSchema);
