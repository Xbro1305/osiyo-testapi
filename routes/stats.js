// ============================================================================
//  routes/stats.js
//
//  GET /api/stats — one round trip for everything the home dashboard AND each
//  department-home page need to render their tiles + summary statistics.
//
//  Response shape:
//  {
//    counts: { input: N, bleach: N, dyeing: N, ... },   // 16 station keys
//    sums: {
//      printing:     { printedQty: N },
//      finishing:    { finishedQty: N },
//      calendering:  { qty: N },
//      folding:      { totalMeters: N, firstQty: N, secondQty: N, rejectQty: N },
//      dispatch_out: { qty: N },
//    },
//    customers: N, sales: N, payments: N, stockIn: N,
//    storeTotals: { stockInQty: N, salesQty: N, salesValue: N, paidAmount: N },
//  }
//
//  Implementation: all queries run in parallel via Promise.all. Counts use
//  countDocuments() (indexed); sums use a tiny aggregation pipeline per
//  station, projecting only the numeric field we care about. Both are O(N)
//  in the collection but read only one field per row, so they're cheap.
// ============================================================================

import express from 'express';
import Record from '../models/Record.js';
import Customer from '../models/Customer.js';
import StoreSale from '../models/StoreSale.js';
import StorePayment from '../models/StorePayment.js';
import StoreStockIn from '../models/StoreStockIn.js';
import Design from '../models/Design.js';
import Machine from '../models/Machine.js';
import Program from '../models/Program.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// Keep this list aligned with VALID_STATION_KEYS in records.js. If you add
// a new station, add it here too so the home dashboard sees its count.
const STATION_KEYS = [
  'gray_store', 'gray_out',
  'input', 'bleach', 'dyeing', 'batching',
  'printing', 'curing', 'finishing', 'calendering', 'folding',
  'dispatch_in', 'dispatch_out',
  'maintenance', 'breakdown', 'dailycheck',
];

// Per-station numeric fields to sum. These match the aggregates the
// PrintingDepartmentHome and StoreDepartmentHome show as headline stats.
// Add an entry here when you want a new sum exposed to the home pages.
const SUM_FIELDS = {
  printing: ['printedQty'],
  finishing: ['finishedQty'],
  calendering: ['qty'],
  folding: ['totalMeters', 'firstQty', 'secondQty', 'rejectQty'],
  dispatch_out: ['qty'],
};

// Run one aggregation that returns the sums of the given fields for a station.
// Mongoose's aggregate is faster than fetching the rows because the pipeline
// runs server-side and only the summed numbers come back over the wire.
async function sumFieldsFor(stationKey, fields) {
  if (!fields || !fields.length) return {};
  // Build a $group stage that produces one accumulator per field.
  const groupStage = { _id: null };
  for (const f of fields) {
    // $toDouble coerces strings to numbers (the artifact stores qty fields
    // as strings sometimes). $ifNull guards rows where the field is missing.
    groupStage[f] = {
      $sum: {
        $convert: {
          input: { $ifNull: [`$data.${f}`, 0] },
          to: 'double',
          onError: 0,
          onNull: 0,
        },
      },
    };
  }
  const result = await Record.aggregate([
    { $match: { stationKey } },
    { $group: groupStage },
  ]);
  if (!result.length) {
    // Empty collection — return zeros for every requested field.
    return Object.fromEntries(fields.map((f) => [f, 0]));
  }
  const row = result[0];
  delete row._id;
  return row;
}

router.get('/', async (_req, res) => {
  try {
    // ---- Counts: one countDocuments per station + four store counts ----
    const stationCountPromises = STATION_KEYS.map((k) =>
      Record.countDocuments({ stationKey: k }).then((n) => [k, n])
    );

    // ---- Sums: one aggregate per station that has sum fields configured ----
    const sumPromises = Object.entries(SUM_FIELDS).map(([k, fields]) =>
      sumFieldsFor(k, fields).then((s) => [k, s])
    );

    // ---- Store-section aggregates ----
    // StockIn total qty, sales qty + value + paid, for the Local Market Store
    // department home stats.
    const storeStockInAggPromise = StoreStockIn.aggregate([
      {
        $group: {
          _id: null,
          stockInQty: {
            $sum: { $convert: { input: { $ifNull: ['$qty', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
        },
      },
    ]);
    const storeSalesAggPromise = StoreSale.aggregate([
      {
        $group: {
          _id: null,
          salesQty: {
            $sum: { $convert: { input: { $ifNull: ['$qty', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
          salesValue: {
            $sum: { $convert: { input: { $ifNull: ['$totalAmount', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
          paidAmount: {
            $sum: { $convert: { input: { $ifNull: ['$paidAmount', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
        },
      },
    ]);
    // Sum of payments-received (the StorePayment collection — money customers
    // pay against earlier debt, separate from paid-at-sale).
    const storePaymentsAggPromise = StorePayment.aggregate([
      {
        $group: {
          _id: null,
          paymentsTotal: {
            $sum: { $convert: { input: { $ifNull: ['$amount', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
        },
      },
    ]);

    const [
      stationEntries,
      sumEntries,
      customers,
      sales,
      payments,
      stockIn,
      designs,
      machines,
      programs,
      stockInAgg,
      salesAgg,
      paymentsAgg,
    ] = await Promise.all([
      Promise.all(stationCountPromises),
      Promise.all(sumPromises),
      Customer.countDocuments(),
      StoreSale.countDocuments(),
      StorePayment.countDocuments(),
      StoreStockIn.countDocuments(),
      Design.countDocuments(),
      Machine.countDocuments(),
      Program.countDocuments(),
      storeStockInAggPromise,
      storeSalesAggPromise,
      storePaymentsAggPromise,
    ]);

    const counts = {};
    for (const [k, n] of stationEntries) counts[k] = n;

    const sums = {};
    for (const [k, s] of sumEntries) sums[k] = s;

    const storeTotals = {
      stockInQty: stockInAgg[0]?.stockInQty || 0,
      salesQty: salesAgg[0]?.salesQty || 0,
      salesValue: salesAgg[0]?.salesValue || 0,
      paidAmount: salesAgg[0]?.paidAmount || 0,
      paymentsTotal: paymentsAgg[0]?.paymentsTotal || 0,
    };

    res.json({
      counts,
      sums,
      customers,
      sales,
      payments,
      stockIn,
      designs,
      machines,
      programs,
      storeTotals,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
