import express from 'express';
import Record from '../models/Record.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// All station keys we accept. Any other stationKey is rejected so that random
// strings can't pollute the DB.
const VALID_STATION_KEYS = new Set([
  'gray_store', 'gray_out',
  'input', 'bleach', 'dyeing', 'batching',
  'printing', 'curing', 'finishing', 'calendering', 'folding',
  'dispatch_in', 'dispatch_out',
  'maintenance', 'breakdown', 'dailycheck',
]);

function assertValidKey(key, res) {
  if (!VALID_STATION_KEYS.has(key)) {
    res.status(400).json({ error: `Unknown stationKey: ${key}` });
    return false;
  }
  return true;
}

// GET /api/records/:stationKey — return all records for that station.
router.get('/:stationKey', async (req, res) => {
  try {
    if (!assertValidKey(req.params.stationKey, res)) return;
    const records = await Record.find({ stationKey: req.params.stationKey })
      .sort({ createdAt: -1 })
      .lean();
    // The artifact stores the full record under .data — return that directly.
    res.json(records.map(r => r.data));
  } catch (err) {
    console.error('Get records error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/records/:stationKey — create or update one record.
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

// DELETE /api/records/:stationKey/:id
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

export default router;
