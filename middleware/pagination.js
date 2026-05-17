// ============================================================================
//  middleware/pagination.js
//
//  Shared helpers for paginating list endpoints + projecting only the fields
//  the caller asked for via `?fields=a,b,c`. The whole point is to drop the
//  wire size on big tables: the artifact's home dashboard and station pages
//  used to download every row of every table, even when they needed five
//  rows on screen.
//
//  Compatibility:
//    - If the request DOES NOT include `?limit=`, list routes keep returning
//      a plain array (legacy shape). Old frontends keep working.
//    - If `?limit=` IS present, list routes return the envelope
//      { items, total, limit, offset } so the client can render pagination.
//    - `?fields=` is ALWAYS honoured if present. Empty/missing means full
//      documents.
//
//  Edge cases the helpers handle:
//    - Caps `limit` at 1000 so a malicious or buggy client can't ask for
//      everything in one call.
//    - Negative offset → coerced to 0.
//    - Mongoose `.select()` accepts a space-delimited string. We never let
//      `_id`/`__v` through unless the caller asked for them, which matches
//      the existing route behaviour of using `.lean()` without trimming.
// ============================================================================

const MAX_LIMIT = 1000;

// parseListQuery(req) — read pagination/projection from the query string.
// Returns: { limit, offset, fields, paginated }
//   - `paginated` is true iff the caller passed `?limit=…`. Callers use this
//     to decide whether to send a plain array or the envelope shape.
//   - `fields` is a string[] of field names (e.g. ['id', 'batchNo']) or null
//     when nothing was requested.
export function parseListQuery(req) {
  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;
  const rawFields = req.query.fields;

  const paginated = rawLimit !== undefined && rawLimit !== '';
  let limit = paginated ? parseInt(rawLimit, 10) : 0;
  if (!Number.isFinite(limit) || limit < 0) limit = 0;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let offset = parseInt(rawOffset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;

  let fields = null;
  if (typeof rawFields === 'string' && rawFields.trim()) {
    fields = rawFields
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return { limit, offset, fields, paginated };
}

// buildProjection(fields, opts) — translate ['id','batchNo'] into a Mongoose
// `.select()` string.
//
// opts.dataPath = 'data' means the document stores the actual fields under
// a sub-object (this is the case for the Record model, where each station
// row lives at `.data.<field>`). For that case, we project `data.id data.batchNo`
// and the caller unwraps `.data` in the response.
//
// opts.alwaysIncludeId — set true so the response can always be uniquely
// keyed by `id`, even if the caller forgot to ask for it.
export function buildProjection(fields, opts = {}) {
  if (!fields || !fields.length) return null;
  const dataPath = opts.dataPath || null;
  const always = opts.alwaysIncludeId === false ? [] : ['id'];
  const set = new Set([...always, ...fields]);
  const list = [...set].map((f) => (dataPath ? `${dataPath}.${f}` : f));
  return list.join(' ');
}

// respondList(res, items, total, q) — send a list response in the right shape.
// - If q.paginated, send the envelope { items, total, limit, offset }
// - Otherwise, send the plain array (legacy back-compat)
export function respondList(res, items, total, q) {
  if (q.paginated) {
    return res.json({
      items,
      total,
      limit: q.limit,
      offset: q.offset,
    });
  }
  return res.json(items);
}
