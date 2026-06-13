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
//    designs: N, machines: N, programs: N,
//    storeTotals: {
//      stockInQty: N, stockInCost: N,
//      salesQty: N, salesValue: N, paidAmount: N, paymentsTotal: N,
//    },
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
//
// Note: `input` station tracks `meters` (the SING&DES batch's total
// meters). Folding tracks 4 sort buckets so the dept-home can show a
// breakdown (fresh / 2nd / reject / incomplete).
const SUM_FIELDS = {
  input: ['meters'],
  printing: ['printedQty'],
  finishing: ['finishedQty'],
  calendering: ['qty'],
  folding: ['totalMeters', 'firstQty', 'secondQty', 'rejectQty', 'incompleteQty'],
  dispatch_out: ['qty'],
};

// Run one aggregation that returns the sums of the given fields for a station.
// Mongoose's aggregate is faster than fetching the rows because the pipeline
// runs server-side and only the summed numbers come back over the wire.
//
// `dateRange` is optional. When provided as { from, to } (inclusive YYYY-MM-DD
// strings), the aggregation matches only records whose `data.date` falls in
// that range. Used for the monthly stat cards on the printing dept home.
async function sumFieldsFor(stationKey, fields, dateRange) {
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
  // Build the pipeline. If a dateRange is given, the $match limits records
  // to the window. Using string comparison on YYYY-MM-DD is timezone-safe
  // and indexable (cheap when there's an index on { stationKey, 'data.date' }).
  const match = { stationKey };
  if (dateRange && dateRange.from && dateRange.to) {
    match['data.date'] = { $gte: dateRange.from, $lte: dateRange.to };
  }
  const result = await Record.aggregate([
    { $match: match },
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

    // ---- Month-scoped sums (current calendar month, server clock) ----
    //
    // Same aggregations, but with a date-range $match. Used by the dept
    // home tiles to show "this month's meters" instead of all-time. The
    // server clock defines the month, not the client — that's fine for our
    // operators since the data is entered live and they're all in one
    // timezone. If timezone drift becomes an issue, switch to passing
    // ?from=&to= from the client and use those instead.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const monthFrom = `${yyyy}-${mm}-01`;
    // Last day of the current month: jump to next month's day-0 (= last day
    // of this month) and ISO-format. Day count varies (28-31), this handles it.
    const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
    const monthTo = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    const monthRange = { from: monthFrom, to: monthTo };
    const monthSumPromises = Object.entries(SUM_FIELDS).map(([k, fields]) =>
      sumFieldsFor(k, fields, monthRange).then((s) => [k, s])
    );

    // ---- Store-section aggregates ----
    // StockIn total qty + total cost, sales qty + value + paid, for the
    // Local Market Store department home stats.
    //
    // Note about `qty`: v2 stock-in records have rich shape (rollLines +
    // extraMeters) but the frontend always mirrors the computed total into
    // `qty` on save, so summing `qty` here continues to give the correct
    // total meters across both legacy and v2 records. No aggregation over
    // the rollLines array is needed.
    //
    // `stockInCost` = Σ(qty × costPerMeter).
    //
    // As of v4 the canonical cost lives on the stock fabric type list, not
    // on individual records. The frontend Stock In form persists a SNAPSHOT
    // of the resolved cost into `costPerMeter` on save, so this aggregation
    // continues to give a correct (point-in-time) figure for both legacy
    // and v4 records without joining ConfigLists at query time. If the list
    // cost changes later, the snapshot on saved records doesn't move —
    // that's intentional, so reports are reproducible.
    const storeStockInAggPromise = StoreStockIn.aggregate([
      {
        $group: {
          _id: null,
          stockInQty: {
            $sum: { $convert: { input: { $ifNull: ['$qty', 0] }, to: 'double', onError: 0, onNull: 0 } },
          },
          stockInCost: {
            $sum: {
              $multiply: [
                { $convert: { input: { $ifNull: ['$qty', 0] }, to: 'double', onError: 0, onNull: 0 } },
                { $convert: { input: { $ifNull: ['$costPerMeter', { $ifNull: ['$costPrice', 0] }] }, to: 'double', onError: 0, onNull: 0 } },
              ],
            },
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
      monthSumEntries,
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
      Promise.all(monthSumPromises),
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

    // Month-scoped sums — same shape as `sums` but for the current month.
    const monthSums = {};
    for (const [k, s] of monthSumEntries) monthSums[k] = s;

    const storeTotals = {
      stockInQty: stockInAgg[0]?.stockInQty || 0,
      stockInCost: stockInAgg[0]?.stockInCost || 0,
      salesQty: salesAgg[0]?.salesQty || 0,
      salesValue: salesAgg[0]?.salesValue || 0,
      paidAmount: salesAgg[0]?.paidAmount || 0,
      paymentsTotal: paymentsAgg[0]?.paymentsTotal || 0,
    };

    res.json({
      counts,
      sums,
      monthSums,
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
