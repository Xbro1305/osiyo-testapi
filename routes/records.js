import express from 'express';
import Record from '../models/Record.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

const router = express.Router();
router.use(authenticate);

// All station keys we accept. Any other stationKey is rejected so that random
// strings can't pollute the DB.
const VALID_STATION_KEYS = new Set([
  'gray_store', 'gray_out',
  'input', 'bleach', 'dyeing', 'batching',
  'printing', 'curing', 'finishing', 'calendering', 'folding',
  'dispatch_in', 'dispatch_out',
  'ombor_in', 'ombor_out',
  'maintenance', 'breakdown', 'dailycheck',
]);

// ============================================================================
//  Per-station search configuration
// ----------------------------------------------------------------------------
//  When the client sends `?search=foo`, we run a case-insensitive regex
//  match against each listed field on that station. This is a per-station
//  whitelist — we don't run the regex against every column blindly, because
//  some columns store large free-text (notes) that would slow the query.
//
//  Add a station? Add its searchable fields here.
// ============================================================================
const SEARCHABLE_FIELDS = {
  gray_store:  ['grayStoreNo', 'source', 'fabricType', 'supplier'],
  gray_out:    ['source', 'destination', 'fabricType'],
  input:       ['batchNo', 'source', 'fabricType'],
  bleach:      ['batchNo', 'fabricType', 'machine'],
  dyeing:      ['batchNo', 'dyeingNo', 'fabricType', 'color'],
  batching:    ['batchNo', 'fabricType', 'machine'],
  printing:    ['printNo', 'designNumber', 'fabricType', 'machine'],
  curing:      ['printNo', 'designNumber'],
  finishing:   ['printNo', 'designNumber', 'machine'],
  calendering: ['printNo', 'designNumber', 'machine'],
  folding:     ['printNo', 'designNumber', 'machine'],
  dispatch_in: ['printNo', 'designNumber'],
  dispatch_out:['printNo', 'designNumber', 'destination', 'driver'],
  ombor_in:    ['designNumber', 'source', 'fabricType'],
  ombor_out:   ['designNumber', 'destination', 'driver', 'sentBy', 'fabricType'],
  maintenance: ['machine', 'stationId', 'reason'],
  breakdown:   ['machine', 'stationId', 'type', 'cause'],
  dailycheck:  ['machine', 'stationId', 'result'],
};

// Mongo regex-escape — required because user input may contain regex chars
// like '.', '*', '+', '(', etc. that would otherwise be interpreted.
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build a Mongo filter object from query string parameters.
// Recognized params:
//   search       — free text, OR-matched against the station's searchable fields
//   dateFrom     — inclusive lower bound on data.date (YYYY-MM-DD string compare)
//   dateTo       — inclusive upper bound on data.date
//   shift        — exact match on data.shift
//   fabricType   — exact match on data.fabricType
//   designNumber — exact match on data.designNumber
//   batchNo      — exact match on data.batchNo
//   printNo      — exact match on data.printNo
//   dyeingNo     — exact match on data.dyeingNo
//   completion   — exact match on data.completion ('COMPLETED' / 'NOT COMPLETED')
//
// Unknown params are ignored — silently — so adding a new field on the client
// doesn't break the server.
function buildRecordFilter(stationKey, q) {
  const filter = { stationKey };
  const and = [];

  // Date range — applied as $gte / $lte on the ISO-date string. The artifact
  // stores dates as YYYY-MM-DD which sorts correctly lexically.
  if (q.dateFrom) and.push({ 'data.date': { $gte: String(q.dateFrom) } });
  if (q.dateTo) {
    // If a previous $gte exists for the same field, merge them.
    const last = and[and.length - 1];
    if (last && last['data.date']) {
      last['data.date'].$lte = String(q.dateTo);
    } else {
      and.push({ 'data.date': { $lte: String(q.dateTo) } });
    }
  }

  // Direct equality filters. Listing them out (rather than looping over
  // req.query) is intentional — it acts as a whitelist so the client can't
  // inject arbitrary mongo keys.
  const directFields = [
    'shift', 'fabricType', 'designNumber', 'batchNo',
    'printNo', 'dyeingNo', 'completion',
  ];
  for (const f of directFields) {
    if (q[f] !== undefined && q[f] !== '') {
      and.push({ [`data.${f}`]: String(q[f]) });
    }
  }

  // Free-text search across the station's whitelisted fields.
  if (q.search && String(q.search).trim()) {
    const fields = SEARCHABLE_FIELDS[stationKey] || [];
    if (fields.length) {
      const rx = new RegExp(escapeRegex(String(q.search).trim()), 'i');
      and.push({
        $or: fields.map((f) => ({ [`data.${f}`]: rx })),
      });
    }
  }

  if (and.length) filter.$and = and;
  return filter;
}

function assertValidKey(key, res) {
  if (!VALID_STATION_KEYS.has(key)) {
    res.status(400).json({ error: `Unknown stationKey: ${key}` });
    return false;
  }
  return true;
}

// GET /api/records/:stationKey
//
// Supports the standard pagination/projection params (?limit, ?offset, ?fields)
// AND the search/filter params parsed by buildRecordFilter above. The artifact
// stores actual record fields under `.data`, so projection is applied through
// `data.*` and `.data` is unwrapped on the way out.
//
// Sort: data.date DESC then createdAt DESC. The Record model has an index on
// `{ stationKey, 'data.date': -1 }` so this is stable and fast.
router.get('/:stationKey', async (req, res) => {
  try {
    if (!assertValidKey(req.params.stationKey, res)) return;
    const stationKey = req.params.stationKey;

    const q = parseListQuery(req);
    const projection = buildProjection(q.fields, { dataPath: 'data' });
    const filter = buildRecordFilter(stationKey, req.query);

    let query = Record.find(filter).sort({ 'data.date': -1, createdAt: -1 });
    if (projection) query = query.select(projection);

    if (q.paginated) {
      const [rows, total] = await Promise.all([
        query.skip(q.offset).limit(q.limit).lean(),
        Record.countDocuments(filter),
      ]);
      const items = rows.map((r) => r.data || {});
      return respondList(res, items, total, q);
    }

    const rows = await query.lean();
    const items = rows.map((r) => r.data || {});
    return respondList(res, items, items.length, q);
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:stationKey', async (req, res) => {
  try {
    if (!assertValidKey(req.params.stationKey, res)) return;
    const recordData = req.body || {};
    if (!recordData.id) return res.status(400).json({ error: 'record.id is required' });

    const result = await Record.findOneAndUpdate(
      { id: recordData.id, stationKey: req.params.stationKey },
      { id: recordData.id, stationKey: req.params.stationKey, data: recordData },
      { upsert: true, new: true }
    ).lean();
    res.json(result.data);
  } catch (err) {
    console.error('Save record error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:stationKey/:id', async (req, res) => {
  try {
    if (!assertValidKey(req.params.stationKey, res)) return;
    await Record.deleteOne({ stationKey: req.params.stationKey, id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================================================
//  Batch archive — soft-hide many records at once
// ----------------------------------------------------------------------------
//  Body shapes accepted:
//    { before: "YYYY-MM-DD" }  — archive every record at this station with
//                                data.date <= before (records without a date
//                                are skipped)
//    { ids: ["...","..."] }    — archive a specific list of record ids
//    { archived: false }       — combine with either above to UNARCHIVE
//                                instead. Defaults to true (archive).
//
//  Returns: { modified: N }
// ============================================================================
router.post('/:stationKey/archive-batch', async (req, res) => {
  try {
    if (!assertValidKey(req.params.stationKey, res)) return;
    const { before, ids, archived } = req.body || {};
    const setArchived = archived === false ? false : true;
    const filter = { stationKey: req.params.stationKey };
    if (before) {
      filter['data.date'] = { $lte: String(before) };
    } else if (Array.isArray(ids) && ids.length) {
      filter.id = { $in: ids };
    } else {
      return res.status(400).json({
        error: "Either 'before' (YYYY-MM-DD) or 'ids' (string[]) is required",
      });
    }
    // Use $set on data.archived. Mongoose's strict schema lets undeclared
    // sub-fields through (data is Mixed type), so this works without
    // schema changes.
    const result = await Record.updateMany(filter, {
      $set: { 'data.archived': setArchived },
    });
    res.json({
      modified: result.modifiedCount || result.nModified || 0,
      matched: result.matchedCount || result.n || 0,
    });
  } catch (err) {
    console.error('Archive batch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
