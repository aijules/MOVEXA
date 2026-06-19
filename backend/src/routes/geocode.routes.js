/**
 * Geocoding — free address/place search via OpenStreetMap Nominatim.
 * Biased to the Kigali area so door-to-door planning can resolve any address,
 * not just named bus stops. Results are cached in-memory to respect the
 * Nominatim usage policy (max ~1 req/sec) and keep the UI snappy.
 */
const router = require('express').Router();

// Kigali viewbox (lon/lat): west,north,east,south — biases + bounds results.
const KIGALI_VIEWBOX = '29.95,-1.85,30.25,-2.05';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Simple TTL cache: query → { at, data }
const cache = new Map();
const TTL_MS = 1000 * 60 * 60; // 1 hour
let lastCallAt = 0;

function fromCache(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return null;
}

// GET /api/geocode?q=kigali heights
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.json({ success: true, data: [] });

    const key = q.toLowerCase();
    const cached = fromCache(key);
    if (cached) return res.json({ success: true, data: cached, cached: true });

    // Throttle to ~1 req/sec as Nominatim requires.
    const wait = Math.max(0, 1100 - (Date.now() - lastCallAt));
    if (wait) await new Promise(r => setTimeout(r, wait));
    lastCallAt = Date.now();

    const url = `${NOMINATIM}?format=jsonv2&q=${encodeURIComponent(q)}`
      + `&viewbox=${KIGALI_VIEWBOX}&bounded=1&limit=6&addressdetails=1&countrycodes=rw`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'MoveXa-Transit/1.0 (dissertation project)' },
    });
    if (!resp.ok) return res.json({ success: true, data: [] });
    const raw = await resp.json();

    const data = (raw || []).map(p => ({
      type:  'place',
      placeId: p.place_id,
      label: p.display_name?.split(',').slice(0, 2).join(',').trim() || p.name,
      fullLabel: p.display_name,
      lat:   Number(p.lat),
      lng:   Number(p.lon),
      category: p.category || p.type,
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    cache.set(key, { at: Date.now(), data });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports = router;
