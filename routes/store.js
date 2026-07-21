import express from 'express';
import StoreSale from '../models/StoreSale.js';
import StorePayment from '../models/StorePayment.js';
import StoreStockIn from '../models/StoreStockIn.js';
import Design from '../models/Design.js';
import { authenticate } from '../middleware/auth.js';
import {
  parseListQuery,
  buildProjection,
  respondList,
} from '../middleware/pagination.js';

// Three parallel sub-routers under /api/store/{sales,payments,stockin}.
// All use the same CRUD pattern with pagination; we factor that into a small helper.

function crudRouter(Model, name) {
  const r = express.Router();
  r.use(authenticate);

  r.get('/', async (req, res) => {
    try {
      const q = parseListQuery(req);
      const projection = buildProjection(q.fields);

      let query = Model.find().sort({ date: -1 });
      if (projection) query = query.select(projection);

      if (q.paginated) {
        const [items, total] = await Promise.all([
          query.skip(q.offset).limit(q.limit).lean(),
          Model.countDocuments(),
        ]);
        return respondList(res, items, total, q);
      }
      const items = await query.lean();
      return respondList(res, items, items.length, q);
    } catch (err) {
      console.error(`Get ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  r.post('/', async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const result = await Model.findOneAndUpdate({ id }, req.body, { upsert: true, new: true }).lean();
      res.json(result);
    } catch (err) {
      console.error(`Save ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  r.delete('/:id', async (req, res) => {
    try {
      await Model.deleteOne({ id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(`Delete ${name} error:`, err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  return r;
}

// ============================================================================
//  PUBLIC read-only on-hand stock  —  GET /api/store/stock
//
//  For the customer-facing website. Returns the Local Market Store's current
//  on-hand stock (what's available to sell), aggregated exactly like the app's
//  "Current Stock" screen: stock-in meters minus sold meters, grouped per
//  variant (printed design / dyed color / plain fabric / mixed remainder) and
//  split by stock fabric type. Only rows with on-hand > 0 are returned.
//
//  Read-only: no create/update/delete here. Optionally protected by an API
//  key — set STORE_STOCK_API_KEY in the backend env and the client site must
//  send it as the `x-api-key` header (or ?key=). If the env var is unset the
//  endpoint is open (fine for a public catalogue; set the key if stock levels
//  are commercially sensitive). CORS is already handled globally in server.js.
// ============================================================================

// Meters a stock-in record contributes (mirrors the app's stockInMeters()):
// unit=rolls → Σ(length×qty)+extraMeters; unit=meters → qty; legacy → lines if any, else qty.
function stockInMeters(r) {
  const lineSum = (r.rollLines || []).reduce(
    (s, ln) => s + (Number(ln.length) || 0) * (Number(ln.qty) || 0),
    0,
  );
  const extra = Number(r.extraMeters) || 0;
  const linesPlusExtra = lineSum + extra;
  if (r.unit === 'rolls') return linesPlusExtra;
  if (r.unit === 'meters') return Number(r.qty) || 0;
  return linesPlusExtra > 0 ? linesPlusExtra : Number(r.qty) || 0;
}

// Variant grouping key (mirrors the app's keyFor()).
function keyFor(r) {
  const ft = (r.stockFabricType || r.fabricType || '(none)').trim() || '(none)';
  if (r.designId === 'remainder') return { key: `r:remainder::${ft}`, kind: 'remainder', ft };
  if (r.fabricState === 'printed' && r.designId && r.designId !== 'mix')
    return { key: `d:${r.designId}::${ft}`, kind: 'design', ft };
  if (r.fabricState === 'dyed' && r.hexColor)
    return { key: `c:${r.hexColor.toLowerCase()}::${ft}`, kind: 'color', ft };
  return { key: `f:${ft}`, kind: 'fabric', ft };
}

async function computeOnHand() {
  const [stockIns, sales, designs] = await Promise.all([
    StoreStockIn.find().lean(),
    StoreSale.find().lean(),
    Design.find().select('id designNumber name').lean(),
  ]);
  const designById = {};
  for (const d of designs) designById[d.id] = d;

  const groups = {};
  function ensure(r, kind, key, ft) {
    if (!groups[key]) {
      const d = kind === 'design' && r.designId ? designById[r.designId] : null;
      groups[key] = {
        kind,
        designId: kind === 'design' ? r.designId : undefined,
        designNumber: d?.designNumber,
        designName: d?.name,
        hexColor: kind === 'color' ? r.hexColor : undefined,
        colorName: kind === 'color' ? r.colorName : undefined,
        fabricType: ft,
        unit: r.unit || 'meters',
        inQty: 0,
        outQty: 0,
        rollsByLength: {},
        looseMeters: 0,
      };
    } else if (kind === 'color' && r.colorName) {
      groups[key].colorName = r.colorName;
    }
    return groups[key];
  }
  function applyRollLines(row, lines, sign) {
    if (!Array.isArray(lines)) return;
    for (const ln of lines) {
      const len = Number(ln.length) || 0;
      const qty = Number(ln.qty) || 0;
      if (qty <= 0) continue;
      if (len === 0) row.looseMeters += sign * qty;
      else row.rollsByLength[len] = (row.rollsByLength[len] || 0) + sign * qty;
    }
  }

  // ----- Stock-in adds -----
  for (const r of stockIns) {
    const { key, kind, ft } = keyFor(r);
    const row = ensure(r, kind, key, ft);
    const meters = stockInMeters(r);
    row.inQty += meters;
    row.looseMeters += Number(r.extraMeters) || 0;
    if (r.unit === 'meters') row.looseMeters += Number(r.qty) || 0;
    applyRollLines(row, r.rollLines, 1);
  }

  // ----- Sales subtract (v5 per-line variant, else legacy single-variant) -----
  for (const s of sales) {
    const lines = s.rollLines || [];
    const perLine = lines.some((ln) => ln.designId || ln.hexColor || ln.fabricType);
    if (perLine) {
      for (const ln of lines) {
        const synthetic = {
          fabricState: ln.designId ? 'printed' : 'dyed',
          designId: ln.designId,
          hexColor: ln.hexColor,
          colorName: ln.colorName,
          stockFabricType: ln.fabricType || s.stockFabricType,
          fabricType: ln.fabricType || s.fabricType,
        };
        const { key, kind, ft } = keyFor(synthetic);
        const row = ensure(synthetic, kind, key, ft);
        const lenN = Number(ln.length) || 0;
        const qtyN = Number(ln.qty) || 0;
        if (lenN > 0 && qtyN > 0) {
          row.rollsByLength[lenN] = (row.rollsByLength[lenN] || 0) - qtyN;
          row.outQty += lenN * qtyN;
        } else if (lenN === 0 && qtyN > 0) {
          row.looseMeters -= qtyN;
          row.outQty += qtyN;
        }
      }
    } else {
      const { key, kind, ft } = keyFor(s);
      const row = ensure(s, kind, key, ft);
      const legacyLines = s.rollLines || [];
      let legacyMeters = 0;
      for (const ln of legacyLines) {
        const lenN = Number(ln.length) || 0;
        const qtyN = Number(ln.qty) || 0;
        if (qtyN <= 0) continue;
        legacyMeters += lenN === 0 ? qtyN : lenN * qtyN;
      }
      row.outQty += legacyMeters > 0 ? legacyMeters : Number(s.qty) || 0;
      applyRollLines(row, legacyLines, -1);
    }
  }

  // ----- Shape the public payload: on-hand > 0 only -----
  return Object.values(groups)
    .map((g) => {
      const onHandMeters = Math.round((g.inQty - g.outQty) * 100) / 100;
      const rolls = Object.entries(g.rollsByLength)
        .map(([length, qty]) => ({ length: Number(length), qty: Number(qty) }))
        .filter((x) => x.qty > 0)
        .sort((a, b) => a.length - b.length);
      const label =
        g.kind === 'design'
          ? [g.designNumber, g.designName].filter(Boolean).join(' — ') || 'Design'
          : g.kind === 'color'
            ? g.colorName || g.hexColor || 'Color'
            : g.kind === 'remainder'
              ? 'Mixed remainder'
              : g.fabricType;
      return {
        kind: g.kind,
        label,
        designNumber: g.designNumber,
        designName: g.designName,
        hexColor: g.hexColor,
        colorName: g.colorName,
        fabricType: g.fabricType,
        unit: g.unit,
        onHandMeters,
        looseMeters: Math.round(g.looseMeters * 100) / 100,
        rolls,
      };
    })
    .filter((g) => g.onHandMeters > 0)
    .sort((a, b) => b.onHandMeters - a.onHandMeters);
}

const router = express.Router();

// Public read-only stock feed for the customer site.
router.get('/stock', async (req, res) => {
  try {
    const requiredKey = process.env.STORE_STOCK_API_KEY;
    if (requiredKey) {
      const given = req.get('x-api-key') || req.query.key;
      if (given !== requiredKey) return res.status(401).json({ error: 'Invalid API key' });
    }
    const items = await computeOnHand();
    res.set('Cache-Control', 'public, max-age=60'); // 1-min CDN/browser cache
    res.json({
      updatedAt: new Date().toISOString(),
      count: items.length,
      items,
    });
  } catch (err) {
    console.error('Public store stock error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.use('/sales', crudRouter(StoreSale, 'store-sale'));
router.use('/payments', crudRouter(StorePayment, 'store-payment'));
router.use('/stockin', crudRouter(StoreStockIn, 'store-stockin'));

export default router;
