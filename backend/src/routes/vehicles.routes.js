const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { interpolatePolyline, calcBearing } = require('../utils/geo');
const { HHMMtoMinutes } = require('../utils/time');
const { delayLabel, delayMessage } = require('../services/eta.service');

const SERVICE_START_MIN = 5 * 60;   // 05:00
const SERVICE_END_MIN   = 22 * 60;  // 22:00
const FLEET_SIZE = 463;             // a bus runs one trip at a time → concurrent trips ≤ fleet

// Kigali local time (UTC+2), independent of the server's timezone.
function kigaliNowMin() {
  const k = new Date(Date.now() + 2 * 3600 * 1000);
  return k.getUTCHours() * 60 + k.getUTCMinutes();
}
function minsToHHMM(m) {
  m = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function plateFor(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return `RA${L[h % 23]} ${(h % 900) + 100} ${L[(h >>> 5) % 23]}`;
}

// Small, time-varying delay (≤7 min) so the network shows a realistic on-time/delayed
// mix that changes over time. (Real delays would come from the bus GPS feed.)
function synthDelay(seed) {
  let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const wave = Math.sin(Date.now() / 90000 + (h % 360) * Math.PI / 180);
  const base = (h % 5) - 2;
  const m = kigaliNowMin();
  const peak = (m >= 390 && m <= 540) || (m >= 960 && m <= 1140) ? 1.6 : 0;
  return Math.max(0, Math.min(7, Math.round(wave * 3 + base + peak)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Live vehicles — SCHEDULE-DRIVEN and PROVABLE.
// A bus is "on the road" iff a real scheduled trip is currently mid-route:
//     departure_time <= now <= departure_time + route.duration   (during 05:00–22:00).
// Each in-progress schedule = exactly one bus running exactly one trip. Positions are
// interpolated along the real route path. Outside service hours → no buses.
// (Live GPS hardware would replace the interpolation with measured coordinates.)
// ─────────────────────────────────────────────────────────────────────────────
async function buildLiveVehicles(routeId = null) {
  const nowMin = kigaliNowMin();
  if (nowMin < SERVICE_START_MIN || nowMin > SERVICE_END_MIN) return [];

  const { data: routes } = await supabase
    .from('routes').select('id,route_code,route_name,color,estimated_duration_minutes');
  const routeMap = new Map((routes || []).map(r => [r.id, r]));
  const ridList = routeId ? [routeId] : [...routeMap.keys()];
  if (!ridList.length) return [];

  const [{ data: paths }, { data: rsRaw }] = await Promise.all([
    supabase.from('route_paths').select('route_id,coordinates').in('route_id', ridList),
    supabase.from('route_stops')
      .select('route_id,stop_order,stop_id,stops(stop_name,latitude,longitude)')
      .in('route_id', ridList).order('stop_order'),
  ]);
  const pathMap = new Map((paths || []).map(p => [p.route_id, p.coordinates]));
  const stopsMap = {};
  for (const x of (rsRaw || [])) (stopsMap[x.route_id] = stopsMap[x.route_id] || []).push(x);

  // Scheduled departures that could still be mid-route (within the last ~max-duration).
  const MAX_DUR = 120;
  let sq = supabase.from('schedules')
    .select('id,route_id,departure_time').eq('is_active', true)
    .gte('departure_time', minsToHHMM(nowMin - MAX_DUR))
    .lte('departure_time', minsToHHMM(nowMin))
    .order('departure_time', { ascending: false }).limit(4000);
  if (routeId) sq = sq.eq('route_id', routeId);
  const { data: scheds } = await sq;

  const vehicles = [];
  let idx = 0;
  for (const s of (scheds || [])) {
    const r = routeMap.get(s.route_id);
    const coords = pathMap.get(s.route_id);
    if (!r || !coords || coords.length < 2) continue;
    const dur = r.estimated_duration_minutes || 60;
    const elapsed = nowMin - HHMMtoMinutes(s.departure_time);
    if (elapsed < 0 || elapsed > dur) continue;             // not currently mid-route
    const progress = Math.min(0.98, Math.max(0.02, elapsed / dur));
    const pos = interpolatePolyline(coords, progress);
    if (!pos) continue;
    const ni = Math.min(Math.floor(progress * (coords.length - 1)) + 1, coords.length - 1);
    const heading = calcBearing(pos, coords[ni]);
    const stops = stopsMap[s.route_id] || [];
    const si = Math.min(stops.length - 1, Math.floor(progress * stops.length));
    const cur = stops[si], nxt = stops[Math.min(si + 1, stops.length - 1)], dst = stops[stops.length - 1];
    const delay = synthDelay(s.id);
    const remain = Math.max(1, Math.round((1 - progress) * dur));

    vehicles.push({
      id: s.id, busId: s.id, tripId: s.id,
      plateNumber: plateFor(s.route_id + '-' + s.departure_time),
      busCode: `${r.route_code}/${s.departure_time.slice(0, 5).replace(':', '')}`,
      routeId: s.route_id, routeCode: r.route_code, routeName: r.route_name, routeColor: r.color || '#0EA5A3',
      lat: parseFloat(pos[1].toFixed(7)), lng: parseFloat(pos[0].toFixed(7)),
      speedKph: parseFloat((16 + (idx % 14)).toFixed(1)), heading: parseFloat(heading.toFixed(1)),
      progressPercentage: parseFloat((progress * 100).toFixed(1)),
      delayMinutes: delay, delayStatus: delayLabel(delay), delayMessage: delayMessage(delay),
      occupancy: ['Low', 'Medium', 'High', 'Full'][idx % 4], status: 'active',
      currentStop: cur?.stops ? { id: cur.stop_id, name: cur.stops.stop_name, order: cur.stop_order } : null,
      nextStop: nxt?.stops ? { id: nxt.stop_id, name: nxt.stops.stop_name, etaMinutes: Math.max(1, Math.round(remain * 0.3)), order: nxt.stop_order } : null,
      destinationStop: dst?.stops ? { id: dst.stop_id, name: dst.stops.stop_name } : null,
      departureTime: s.departure_time.slice(0, 5),
      recordedAt: new Date().toISOString(),
    });
    idx++;
    if (vehicles.length >= FLEET_SIZE) break;               // ≤ fleet (one trip per bus)
  }
  return vehicles;
}

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/vehicles/live  (supports ?routeId=... and ?routeCode=...)
router.get('/live', async (req, res, next) => {
  try {
    let { routeId, routeCode } = req.query;
    if (!routeId && routeCode) {
      const { data: r } = await supabase.from('routes').select('id').eq('route_code', routeCode).maybeSingle();
      if (r) routeId = r.id;
    }
    const vehicles = await buildLiveVehicles(routeId || null);
    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (err) { next(err); }
});

// GET /api/vehicles/by-route/:routeId
router.get('/by-route/:routeId', async (req, res, next) => {
  try {
    const vehicles = await buildLiveVehicles(req.params.routeId);
    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (err) { next(err); }
});

// GET /api/vehicles/:id/eta
router.get('/:id/eta', async (req, res, next) => {
  try {
    const vehicles = await buildLiveVehicles();
    const v = vehicles.find(veh => String(veh.busId) === req.params.id || veh.plateNumber === req.params.id || veh.busCode === req.params.id);
    if (!v) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true, data: { busId: v.busId, nextStop: v.nextStop, delayMinutes: v.delayMinutes, delayStatus: v.delayStatus } });
  } catch (err) { next(err); }
});

module.exports = { router, buildLiveVehicles };
