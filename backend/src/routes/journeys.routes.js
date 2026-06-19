/**
 * Journey Planner — Supabase backend
 * STRICT: every result must match BOTH origin AND destination queries.
 * No fallback that ignores destination.
 */
const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { haversineMeters } = require('../utils/geo');
const { HHMMtoMinutes } = require('../utils/time');
const { delayLabel, delayMessage } = require('../services/eta.service');
const { getAction } = require('../services/adaptive.service');
const { buildLiveVehicles } = require('./vehicles.routes');
const { computeRoadKm, computeDuration, computeFare, computePassPrices } = require('../services/transportCalc');

// ── helpers ──────────────────────────────────────────────────────────────────

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
}
function minsToHHMM(m) {
  m = Math.max(0, m);
  return `${String(Math.floor(m / 60) % 24).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}
function realNowMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// Deterministic Rwanda-style plate ("RAD 123 C") from a seed string, so the same
// scheduled departure always shows the same (distinct) bus identity across reloads.
function syntheticPlate(seed) {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const prefix = ['RAD', 'RAB', 'RAC', 'RAE', 'RAF', 'RAG'][h % 6];
  const num    = (h % 900) + 100;
  const suffix = letters[(h >>> 5) % letters.length]; // unsigned shift — avoid negative index
  return `${prefix} ${num} ${suffix}`;
}
// Bus identity for a given route + departure time (prefers a real live plate).
function busIdentity(routeCode, depTime, livePlate) {
  return { plate: livePlate || syntheticPlate(`${routeCode}-${depTime}`), code: `${routeCode}/${depTime.replace(':', '')}` };
}
// Parse a "HH:MM" (or "HH:MM:SS") string into minutes-since-midnight; null if invalid.
function parseTimeToMins(t) {
  if (!t || typeof t !== 'string') return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

// Walking minutes inside a journey (transfers + any explicit walk legs).
// Used by the "least walking" sort. Direct rides = 0.
function walkingMinutesOf(j) {
  return (j.legs || [])
    .filter(l => l.type === 'walk' || l.type === 'transfer')
    .reduce((sum, l) => sum + (l.walkMinutes || l.waitMinutes || 0), 0);
}

// Sort journey options by the requested strategy.
//   fastest        → shortest total duration
//   fewest_changes → fewest transfers, then duration
//   least_walking  → least walking/transfer time, then duration
//   best (default) → live-bus routes first, then soonest wait
function sortJourneys(results, sort) {
  const dur  = j => j.summary?.durationMinutes ?? 999;
  const wait = j => j.summary?.waitMinutes ?? 999;
  const xf   = j => j.summary?.transfers ?? 0;
  const arr  = j => parseTimeToMins(j.summary?.arrivalTime) ?? 9999;

  if (sort === 'fastest') {
    results.sort((a, b) => dur(a) - dur(b) || wait(a) - wait(b));
  } else if (sort === 'fewest_changes') {
    results.sort((a, b) => xf(a) - xf(b) || dur(a) - dur(b));
  } else if (sort === 'least_walking') {
    results.sort((a, b) => walkingMinutesOf(a) - walkingMinutesOf(b) || dur(a) - dur(b));
  } else if (sort === 'earliest_arrival') {
    results.sort((a, b) => arr(a) - arr(b) || dur(a) - dur(b));
  } else {
    // "best" — keep the original live-bus-first heuristic
    results.sort((a, b) => {
      const aHasBus = (a.bus !== null || (a.liveBuses?.length > 0)) ? 0 : 1;
      const bHasBus = (b.bus !== null || (b.liveBuses?.length > 0)) ? 0 : 1;
      if (aHasBus !== bHasBus) return aHasBus - bHasBus;
      return wait(a) - wait(b);
    });
  }
  return results;
}

// ── stop-name normalization ───────────────────────────────────────────────────

// Maps common user-facing names to one or more search roots.
// Each root is used as: ilike('%root%')
const STOP_ALIASES = {
  // Real Kigali stop name patterns from imported dataset
  nyamirambo:    ['nyamirambo'],
  sonatubes:     ['sonatub'],
  sonatube:      ['sonatub'],
  // downtown: also match saint famille (real route entry point near CBD)
  downtown:      ['downtown', 'town center', 'saint famille'],
  cbd:           ['downtown', 'saint famille', 'cbd'],
  'town center': ['downtown', 'saint famille', 'town center'],
  nyabugogo:     ['nyabugogo'],
  // kabuga: match the REAL Kabuga bus terminal/hub only, not street stops named "Kabuga Muhima"
  kabuga:        ['kabuga terminal', 'kabuga bus', 'kabuga_terminal', 'kabuga_bus', 'mukabuga'],
  kimironko:     ['kimironko'],
  remera:        ['remera', 'sp_remera'],
  rwandex:       ['rwandex'],
  kacyiru:       ['kacyiru'],
  kicukiro:      ['kicukiro'],
  muhima:        ['muhima'],
  gikondo:       ['gikondo'],
  kanombe:       ['kanombe'],
  rebero:        ['rebero'],
  masaka:        ['masaka'],
  rwamagana:     ['rwamagana'],
  kimisagara:    ['kimisagara'],
  nyarugunga:    ['nyarugunga'],
  airport:       ['airport'],
  bambino:       ['bambino'],
  'chez lando':  ['chez lando'],
};

function buildSearchRoots(query) {
  const q = query.trim().toLowerCase();
  if (STOP_ALIASES[q]) return STOP_ALIASES[q];
  // Generic: try the full query and a version without the last char (handles plural 's')
  const roots = new Set([q]);
  if (q.endsWith('s') && q.length > 5) roots.add(q.slice(0, -1));
  if (q.length > 6) roots.add(q.slice(0, 6)); // 6-char prefix usually enough
  return [...roots];
}

/**
 * Find all stops whose name matches any of the search roots.
 */
async function findStopsByQuery(query) {
  if (!query?.trim()) return [];
  const roots = buildSearchRoots(query);
  const orParts = roots.map(r => `stop_name.ilike.%${r}%`).join(',');
  const { data, error } = await supabase
    .from('stops')
    .select('id,stop_name,latitude,longitude')
    .or(orParts)
    .eq('is_active', true)
    .order('stop_name')
    .limit(30);
  if (error) return [];
  return data || [];
}

// Walking speed for door-to-door legs (metres per minute ≈ 4.8 km/h).
const WALK_MPM = 80;
const NEAR_RADIUS_M = 1500;
// Consider several nearby boarding stops, not just the closest — the nearest
// stop often serves no useful route, so a real planner casts a wider net.
const NEAR_LIMIT = 8;

/**
 * Find the bus stops nearest to a lat/lng, for door-to-door planning.
 * Uses a bounding-box pre-filter then haversine ranking (no PostGIS needed).
 */
async function findNearestStops(lat, lng, radiusM = NEAR_RADIUS_M, limit = NEAR_LIMIT) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const dLat = radiusM / 111000;                                   // ~m per deg lat
  const dLng = radiusM / (111000 * Math.cos((lat * Math.PI) / 180)); // ~m per deg lng
  const { data, error } = await supabase
    .from('stops')
    .select('id,stop_name,latitude,longitude')
    .eq('is_active', true)
    .gte('latitude',  lat - dLat).lte('latitude',  lat + dLat)
    .gte('longitude', lng - dLng).lte('longitude', lng + dLng)
    .limit(60);
  if (error || !data) return [];
  return data
    .map(s => ({ ...s, _distM: haversineMeters(lat, lng, Number(s.latitude), Number(s.longitude)) }))
    .filter(s => s._distM <= radiusM)
    .sort((a, b) => a._distM - b._distM)
    .slice(0, limit);
}

// ── route lookup ──────────────────────────────────────────────────────────────

/**
 * Find routes that contain at least one fromStop AND at least one toStop,
 * where fromStop.stop_order < toStop.stop_order.
 * Returns array of { routeId, fromStopId, fromOrder, toStopId, toOrder }.
 */
async function findDirectRoutes(fromStopIds, toStopIds, excludeRouteIds = new Set()) {
  if (!fromStopIds.length || !toStopIds.length) return [];

  const [{ data: fRs }, { data: tRs }] = await Promise.all([
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', fromStopIds),
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', toStopIds),
  ]);

  // Group by route: routeId → earliest from-stop entry (skip MOCK/DEMO)
  const fromByRoute = new Map();
  for (const r of fRs || []) {
    if (excludeRouteIds.has(r.route_id)) continue;
    const cur = fromByRoute.get(r.route_id);
    if (!cur || r.stop_order < cur.order) {
      fromByRoute.set(r.route_id, { stopId: r.stop_id, order: r.stop_order });
    }
  }
  // Group by route: routeId → latest to-stop entry (skip MOCK/DEMO)
  const toByRoute = new Map();
  for (const r of tRs || []) {
    if (excludeRouteIds.has(r.route_id)) continue;
    const cur = toByRoute.get(r.route_id);
    if (!cur || r.stop_order > cur.order) {
      toByRoute.set(r.route_id, { stopId: r.stop_id, order: r.stop_order });
    }
  }

  const results = [];
  for (const [routeId, fromE] of fromByRoute) {
    const toE = toByRoute.get(routeId);
    if (!toE) continue;
    if (fromE.order < toE.order) {
      results.push({ routeId, fromStopId: fromE.stopId, fromOrder: fromE.order, toStopId: toE.stopId, toOrder: toE.order });
    }
  }
  return results;
}

/**
 * Find transfer routes: route A (has fromStop) → transfer stop → route B (has toStop).
 * Transfer stop must appear on BOTH route A (after fromStop) AND route B (before toStop).
 * Returns array of { routeA, fromStopId, fromOrder, transferStopId, routeB, toStopId, toOrder }.
 */
async function findTransferRoutes(fromStopIds, toStopIds, excludeRouteIds = new Set()) {
  if (!fromStopIds.length || !toStopIds.length) return [];

  const [{ data: fRs }, { data: tRs }] = await Promise.all([
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', fromStopIds),
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', toStopIds),
  ]);

  // Routes containing fromStop: routeId → earliest entry (skip MOCK/DEMO)
  const fromByRoute = new Map();
  for (const r of fRs || []) {
    if (excludeRouteIds.has(r.route_id)) continue;
    const cur = fromByRoute.get(r.route_id);
    if (!cur || r.stop_order < cur.order) fromByRoute.set(r.route_id, { stopId: r.stop_id, order: r.stop_order });
  }
  // Routes containing toStop: routeId → latest entry (skip MOCK/DEMO)
  const toByRoute = new Map();
  for (const r of tRs || []) {
    if (excludeRouteIds.has(r.route_id)) continue;
    const cur = toByRoute.get(r.route_id);
    if (!cur || r.stop_order > cur.order) toByRoute.set(r.route_id, { stopId: r.stop_id, order: r.stop_order });
  }

  const routeAIds = [...fromByRoute.keys()];
  const routeBIds = [...toByRoute.keys()];
  if (!routeAIds.length || !routeBIds.length) return [];

  // Load ALL stops for route A and route B sets
  const [{ data: aAllStops }, { data: bAllStops }] = await Promise.all([
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('route_id', routeAIds),
    supabase.from('route_stops').select('route_id,stop_id,stop_order').in('route_id', routeBIds),
  ]);

  // Build: routeId → all stop ids AFTER the from-stop
  const aAfterSets = new Map(); // routeId → Set<stopId> (stops after fromStop)
  for (const rs of aAllStops || []) {
    const fromE = fromByRoute.get(rs.route_id);
    if (!fromE) continue;
    if (rs.stop_order > fromE.order) {
      if (!aAfterSets.has(rs.route_id)) aAfterSets.set(rs.route_id, new Map());
      aAfterSets.get(rs.route_id).set(rs.stop_id, rs.stop_order);
    }
  }
  // Build: routeId → all stop ids BEFORE the to-stop
  const bBeforeSets = new Map(); // routeId → Set<stopId> (stops before toStop)
  for (const rs of bAllStops || []) {
    const toE = toByRoute.get(rs.route_id);
    if (!toE) continue;
    if (rs.stop_order < toE.order) {
      if (!bBeforeSets.has(rs.route_id)) bBeforeSets.set(rs.route_id, new Map());
      bBeforeSets.get(rs.route_id).set(rs.stop_id, rs.stop_order);
    }
  }

  const results = [];
  for (const [aRid, aAfter] of aAfterSets) {
    if (!aAfter.size) continue;
    const fromE = fromByRoute.get(aRid);
    for (const [bRid, bBefore] of bBeforeSets) {
      if (aRid === bRid) continue;
      const toE = toByRoute.get(bRid);
      // Find a stop shared between aAfter and bBefore
      for (const [stopId] of aAfter) {
        if (bBefore.has(stopId)) {
          results.push({ routeA: aRid, fromStopId: fromE.stopId, fromOrder: fromE.order, transferStopId: stopId, routeB: bRid, toStopId: toE.stopId, toOrder: toE.order });
          break;
        }
      }
      if (results.length >= 3) return results;
    }
  }
  return results;
}

// ── journey builders ──────────────────────────────────────────────────────────

async function getRouteAndSchedule(routeId, refMins = realNowMins()) {
  // refMins = reference departure time (minutes since midnight). Defaults to now,
  // but the planner passes a future value for "depart at …" searches.
  // Query from 5 min before the reference so a just-departed bus still shows.
  const fromHHMM = minsToHHMM(Math.max(5 * 60, refMins - 5)); // min 05:00

  const [{ data: route }, { data: scheds }] = await Promise.all([
    supabase.from('routes').select('id,route_code,route_name,color,estimated_duration_minutes,total_distance_km').eq('id', routeId).maybeSingle(),
    supabase.from('schedules')
      .select('departure_time,arrival_time')
      .eq('route_id', routeId).eq('is_active', true)
      .gte('departure_time', fromHHMM)
      .order('departure_time').limit(6),
  ]);
  // Post-filter in code: discard any departures more than 10 min before the reference
  // (guards against DB type quirks returning stale times despite gte filter)
  const filtered = (scheds || []).filter(s => HHMMtoMinutes(s.departure_time) >= refMins - 10);
  const sched    = filtered[0] || null;
  return { route, sched, nextSchedules: filtered };
}

// liveVehicles pre-fetched by searchJourneys — avoids N redundant DB calls.
// refMins = reference departure time; useLive = whether to match live buses
// (only meaningful for "depart now" searches — false for future depart-at).
async function buildDirectOption(hit, refMins = realNowMins(), liveVehicles = [], useLive = true) {
  const { routeId, fromStopId, fromOrder, toStopId, toOrder } = hit;
  const { route, sched, nextSchedules } = await getRouteAndSchedule(routeId, refMins);
  if (!route) return null;
  if (!useLive) liveVehicles = [];

  const [{ data: fromStop }, { data: toStop }, { data: fromRS }, { data: toRS }] = await Promise.all([
    supabase.from('stops').select('id,stop_name,latitude,longitude').eq('id', fromStopId).maybeSingle(),
    supabase.from('stops').select('id,stop_name,latitude,longitude').eq('id', toStopId).maybeSingle(),
    // Fetch cumulative stop distances from real route_stops data
    supabase.from('route_stops').select('distance_from_start_km').eq('route_id', routeId).eq('stop_id', fromStopId).maybeSingle(),
    supabase.from('route_stops').select('distance_from_start_km').eq('route_id', routeId).eq('stop_id', toStopId).maybeSingle(),
  ]);
  if (!fromStop || !toStop) return null;

  const nowMinsD = refMins;
  const depT     = sched?.departure_time || minsToHHMM(nowMinsD);
  const depM     = HHMMtoMinutes(depT);
  const intermediateStops = Math.max(0, toOrder - fromOrder - 1);

  // ── Distance: prefer real cumulative route_stops data over haversine ──────
  let roadKm;
  const fromDist = fromRS?.distance_from_start_km;
  const toDist   = toRS?.distance_from_start_km;
  if (fromDist != null && toDist != null && toDist > fromDist) {
    roadKm = parseFloat((toDist - fromDist).toFixed(2)); // real road distance from dataset
  } else {
    roadKm = computeRoadKm({
      fromLat: Number(fromStop.latitude), fromLng: Number(fromStop.longitude),
      toLat:   Number(toStop.latitude),   toLng:   Number(toStop.longitude),
      fromOrder, toOrder, totalRouteStops: 0, routeTotalDistKm: route.total_distance_km || 0,
    });
  }
  const durationMins = computeDuration(roadKm, intermediateStops);
  const fareAmount   = computeFare(roadKm);
  const passPrices   = computePassPrices(fareAmount);

  const arrT    = minsToHHMM(depM + durationMins);
  const nowMins = nowMinsD;

  // Pick the live bus closest to the boarding stop (not just index 0)
  let bus = null;
  let bestEtaMin = Infinity;
  for (const v of liveVehicles) {
    if (!v.lat || !v.lng) continue;
    const etaM = Math.round(haversineMeters(v.lat, v.lng, Number(fromStop.latitude), Number(fromStop.longitude)) / (18 * 1000 / 60));
    if (etaM < bestEtaMin) { bestEtaMin = etaM; bus = v; }
  }
  const etaToPickup = bus ? Math.max(1, bestEtaMin) : null;
  const delayMins   = bus?.delayMinutes || 0;

  // Wait = how long until bus reaches boarding stop
  const waitMins     = etaToPickup ?? Math.max(0, depM - nowMins);
  // Only flag a schedule adjustment for NEAR-TERM departures — a next-day 05:20 bus
  // when it's 23:57 should not read "wait 320 min".
  const ecofleetAlert = (waitMins > 15 && waitMins <= 60) ? {
    triggered:   true,
    waitMinutes: waitMins,
    action:      'schedule_adjustment',
    message:     `Schedule adjustment suggested because wait (${waitMins} min) exceeds 15 minutes`,
  } : null;

  const vehicle = busIdentity(route.route_code, depT, bus?.plateNumber);

  // Departure status relative to now
  function depStatus(depMinutes) {
    const diff = depMinutes - nowMins;
    if (diff < -3)  return 'departed';
    if (diff <= 1)  return 'departing_now';
    if (diff <= 60) return `in_${Math.ceil(diff)}_min`;
    return 'next_bus';
  }

  return {
    journeyId:  `journey_${routeId}_${fromStopId}_${toStopId}`,
    type:        'direct',
    routeId,
    routeCode:   route.route_code,
    routeName:   route.route_name,
    routeColor:  route.color,
    vehicle,
    fromStop:    { id: fromStop.id, name: fromStop.stop_name, lat: Number(fromStop.latitude), lng: Number(fromStop.longitude) },
    toStop:      { id: toStop.id,   name: toStop.stop_name,   lat: Number(toStop.latitude),   lng: Number(toStop.longitude) },
    summary: {
      vehicle,
      departureTime:      depT,
      arrivalTime:        arrT,
      durationMinutes:    durationMins,
      numberOfStops:      intermediateStops + 1,
      transfers:          0,
      fareEstimate: {
        amount:      fareAmount,
        currency:    'RWF',
        distanceKm:  parseFloat(roadKm.toFixed(1)),
        passPrices,
      },
      ecofleetAlert,
      delayMinutes:       delayMins,
      delayStatus:        delayLabel(delayMins),
      delayMessage:       delayMessage(delayMins),
      adaptiveMessage:    getAction(delayMins).message,
      etaToPickupMinutes: etaToPickup,
      waitMinutes:        waitMins,
      departureStatus:    depStatus(depM),
      arrivalAtBoardingStop: etaToPickup ? minsToHHMM(nowMins + etaToPickup) : depT,
    },
    // Full bus object + liveBuses array — never null if live buses exist on route
    bus: bus ? {
      id:                 bus.busId,
      plate:              bus.plateNumber,
      busCode:            bus.busCode,
      lat:                bus.lat,
      lng:                bus.lng,
      progressPercentage: bus.progressPercentage,
      currentStop:        bus.currentStop,
      nextStop:           bus.nextStop,
      delayMinutes:       bus.delayMinutes,
      delayStatus:        bus.delayStatus,
    } : null,
    liveBuses: liveVehicles.slice(0, 5).map(v => ({
      busId:              v.busId,
      plateNumber:        v.plateNumber,
      busCode:            v.busCode,
      routeCode:          v.routeCode,
      lat:                v.lat,
      lng:                v.lng,
      progressPercentage: v.progressPercentage,
      currentStop:        v.currentStop,
      nextStop:           v.nextStop,
      arrivalAtBoardingStop: v.lat && v.lng
        ? minsToHHMM(nowMins + Math.max(1, Math.round(haversineMeters(v.lat, v.lng, Number(fromStop.latitude), Number(fromStop.longitude)) / (18 * 1000 / 60))))
        : depT,
      waitMinutes: v.lat && v.lng
        ? Math.max(1, Math.round(haversineMeters(v.lat, v.lng, Number(fromStop.latitude), Number(fromStop.longitude)) / (18 * 1000 / 60)))
        : waitMins,
      departureStatus: depStatus(depM),
      delayMinutes:    v.delayMinutes,
      delayStatus:     v.delayStatus,
    })),
    legs: [{
      type: 'ride', routeId, routeCode: route.route_code, headsign: route.route_name,
      fromStop: fromStop.stop_name, toStop: toStop.stop_name,
      departureTime: depT, arrivalTime: arrT, durationMinutes: durationMins,
    }],
    // Multiple upcoming departures with wait times and status
    nextDepartures: (nextSchedules || []).slice(1).map(s => {
      const dM = HHMMtoMinutes(s.departure_time);
      const wM = Math.max(0, dM - nowMins);
      return {
        departureTime:   s.departure_time,
        arrivalTime:     minsToHHMM(dM + durationMins),
        waitMinutes:     wM,
        departureStatus: depStatus(dM),
      };
    }),
    matchedOriginQuery: true, matchedDestinationQuery: true, isValidJourney: true,
  };
}

async function buildTransferOption(hit, depTime, refMins = realNowMins()) {
  const { routeA, fromStopId, routeB, transferStopId, toStopId } = hit;
  const [
    { route: rA, sched: sA },
    { route: rB, sched: sB },
    { data: fromStop },
    { data: xferStop },
    { data: toStop },
    liveA,
  ] = await Promise.all([
    getRouteAndSchedule(routeA, refMins),
    getRouteAndSchedule(routeB, refMins),
    supabase.from('stops').select('id,stop_name,latitude,longitude').eq('id', fromStopId).maybeSingle(),
    supabase.from('stops').select('id,stop_name,latitude,longitude').eq('id', transferStopId).maybeSingle(),
    supabase.from('stops').select('id,stop_name,latitude,longitude').eq('id', toStopId).maybeSingle(),
    buildLiveVehicles(routeA),
  ]);
  if (!rA || !rB || !fromStop || !xferStop || !toStop) return null;

  const nowMinsX  = refMins;
  const dep1T     = sA?.departure_time || minsToHHMM(nowMinsX);
  const dep1M     = HHMMtoMinutes(dep1T);
  const delayMins = liveA[0]?.delayMinutes || 0;

  // ── Shared calc: leg1 (fromStop → xferStop), leg2 (xferStop → toStop) ───────
  const roadKmLeg1 = computeRoadKm({
    fromLat: Number(fromStop.latitude), fromLng: Number(fromStop.longitude),
    toLat:   Number(xferStop.latitude), toLng:   Number(xferStop.longitude),
  });
  const roadKmLeg2 = computeRoadKm({
    fromLat: Number(xferStop.latitude), fromLng: Number(xferStop.longitude),
    toLat:   Number(toStop.latitude),   toLng:   Number(toStop.longitude),
  });
  const leg1Mins = computeDuration(roadKmLeg1);
  const leg2Mins = computeDuration(roadKmLeg2);
  const arr1M    = dep1M + leg1Mins;
  const dep2M    = arr1M + 5;          // 5-min transfer wait
  const arr2M    = dep2M + leg2Mins;

  // Full route fare = fromStop → toStop distance × 59.48
  const roadKmXfer     = computeRoadKm({
    fromLat: Number(fromStop.latitude), fromLng: Number(fromStop.longitude),
    toLat:   Number(toStop.latitude),   toLng:   Number(toStop.longitude),
  });
  const fareAmountXfer = computeFare(roadKmXfer);
  const passPricesXfer = computePassPrices(fareAmountXfer);

  const waitMinsXfer   = Math.max(0, dep1M - nowMinsX);
  const ecofleetAlertXfer = waitMinsXfer > 15 ? {
    triggered: true, waitMinutes: waitMinsXfer,
    message: `Schedule adjustment suggested because wait (${waitMinsXfer} min) exceeds 15 minutes`,
  } : null;

  return {
    journeyId:  `journey_transfer_${routeA}_${routeB}`,
    type:        'transfer',
    routeCode:   `${rA.route_code}+${rB.route_code}`,
    routeName:   `${rA.route_name} → ${rB.route_name}`,
    routeColor:  rA.color,
    vehicle:     busIdentity(rA.route_code, dep1T, liveA[0]?.plateNumber),
    fromStop:    { id: fromStop.id, name: fromStop.stop_name, lat: Number(fromStop.latitude), lng: Number(fromStop.longitude) },
    toStop:      { id: toStop.id,   name: toStop.stop_name,   lat: Number(toStop.latitude),   lng: Number(toStop.longitude) },
    summary: {
      vehicle:         busIdentity(rA.route_code, dep1T, liveA[0]?.plateNumber),
      departureTime:   dep1T,
      arrivalTime:     minsToHHMM(arr2M),
      durationMinutes: leg1Mins + 5 + leg2Mins,
      transfers:       1,
      fareEstimate:    { amount: fareAmountXfer, currency: 'RWF', distanceKm: parseFloat(roadKmXfer.toFixed(1)), passPrices: passPricesXfer },
      ecofleetAlert:   ecofleetAlertXfer,
      waitMinutes:     waitMinsXfer,
      numberOfStops:   leg1Mins + leg2Mins,
      delayMinutes:    delayMins,
      delayStatus:     delayLabel(delayMins),
      delayMessage:    delayMessage(delayMins),
      adaptiveMessage: getAction(delayMins).message,
    },
    bus: liveA[0] ? { id: liveA[0].busId, plate: liveA[0].plateNumber, lat: liveA[0].lat, lng: liveA[0].lng } : null,
    legs: [
      { type: 'ride',     routeId: routeA, routeCode: rA.route_code, headsign: rA.route_name, fromStop: fromStop.stop_name, toStop: xferStop.stop_name, departureTime: dep1T, arrivalTime: minsToHHMM(arr1M), durationMinutes: leg1Mins },
      { type: 'transfer', stopName: xferStop.stop_name, waitMinutes: 5 },
      { type: 'ride',     routeId: routeB, routeCode: rB.route_code, headsign: rB.route_name, fromStop: xferStop.stop_name, toStop: toStop.stop_name,   departureTime: minsToHHMM(dep2M), arrivalTime: minsToHHMM(arr2M), durationMinutes: leg2Mins },
    ],
    matchedOriginQuery:      true,
    matchedDestinationQuery: true,
    isValidJourney:          true,
  };
}

// ── validation ────────────────────────────────────────────────────────────────

function isValidResult(result, toStopIds) {
  // toStop.id must be one of the stops we found for the destination query
  return toStopIds.includes(result.toStop?.id);
}

// ── route handlers ────────────────────────────────────────────────────────────

async function searchJourneys(fromQuery, toQuery, opts = {}) {
  const { time = null, mode = 'depart', sort = 'best', includeDemo = false,
          fromCoords = null, toCoords = null } = opts;

  // Reference time for the search. "depart" → start from this time; "arrive" → we
  // still build from now/earlier and post-filter so arrival ≤ target.
  const realNow    = realNowMins();
  const targetMins = parseTimeToMins(time);
  const refMins    = (mode === 'depart' && targetMins != null) ? targetMins : realNow;
  // Live buses are only relevant for "leave now" searches (ref within 5 min of now).
  const useLive    = Math.abs(refMins - realNow) <= 5 && mode !== 'arrive';
  const nowMins    = refMins;

  // Pre-fetch MOCK/DEMO route IDs to exclude from real journey planning
  let excludeRouteIds = new Set();
  if (!includeDemo) {
    const { data: mockDemoRoutes } = await supabase
      .from('routes').select('id')
      .or('route_code.ilike.MOCK%,route_code.ilike.DEMO%');
    excludeRouteIds = new Set((mockDemoRoutes || []).map(r => r.id));
  }

  // Door-to-door: when coordinates are supplied (geocoded address/place), board
  // at the nearest stops instead of name-matching. Otherwise match by name.
  const [fromStops, toStops] = await Promise.all([
    fromCoords ? findNearestStops(fromCoords.lat, fromCoords.lng) : findStopsByQuery(fromQuery),
    toCoords   ? findNearestStops(toCoords.lat, toCoords.lng)     : findStopsByQuery(toQuery),
  ]);

  if (!fromStops.length) return { count: 0, data: [], message: `No bus stops near "${fromQuery}"` };
  if (!toStops.length)   return { count: 0, data: [], message: `No bus stops near "${toQuery}"` };

  const fromIds = fromStops.map(s => s.id);
  const toIds   = toStops.map(s => s.id);

  // Pre-fetch ALL live vehicles ONCE — avoids per-route N calls
  // Group by routeId so each builder gets the right buses immediately
  const allVehicles = await buildLiveVehicles(null);
  const vehiclesByRoute = {};
  for (const v of allVehicles) {
    if (!v.routeId) continue;
    if (!vehiclesByRoute[v.routeId]) vehiclesByRoute[v.routeId] = [];
    vehiclesByRoute[v.routeId].push(v);
  }

  // Direct routes — real routes only (MOCK/DEMO excluded)
  const directHits = await findDirectRoutes(fromIds, toIds, excludeRouteIds);
  const results = [];
  const seen    = new Set();

  for (const hit of directHits) {
    const key = `${hit.routeId}_${hit.fromStopId}_${hit.toStopId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Pass pre-fetched vehicles for this route (may be empty — that's OK)
    const routeVehicles = useLive ? (vehiclesByRoute[hit.routeId] || []) : [];
    const option = await buildDirectOption(hit, refMins, routeVehicles, useLive);
    if (!option || !isValidResult(option, toIds)) continue;

    results.push(option);

    // Expand next departures as separate selectable cards — each a DISTINCT bus.
    for (const nd of (option.nextDepartures || [])) {
      const ndM  = HHMMtoMinutes(nd.departureTime);
      const ndW  = Math.max(0, ndM - nowMins);
      const ndAlert = (ndW > 15 && ndW <= 60) ? {
        triggered: true, waitMinutes: ndW,
        message: `Schedule adjustment suggested because wait (${ndW} min) exceeds 15 minutes`,
      } : null;
      const ndVehicle = busIdentity(option.routeCode, nd.departureTime, null);
      results.push({
        ...option,
        journeyId:      `${option.journeyId}_${nd.departureTime.replace(':', '')}`,
        vehicle:        ndVehicle,
        bus:            null, // future departure → not the currently-tracked live bus
        summary: {
          ...option.summary,
          vehicle:            ndVehicle,
          departureTime:      nd.departureTime,
          arrivalTime:        nd.arrivalTime,
          waitMinutes:        ndW,
          etaToPickupMinutes: ndW,
          departureStatus:    nd.departureStatus,
          arrivalAtBoardingStop: minsToHHMM(nowMins + ndW),
          ecofleetAlert:      ndAlert,
        },
        nextDepartures: [],
      });
    }
    // No early break — process ALL directHits so routes with live buses aren't skipped.
    // The final slice(0,9) below limits the response after sorting.
  }

  // Transfer routes (only if no direct found)
  if (results.length === 0) {
    const transferHits = await findTransferRoutes(fromIds, toIds, excludeRouteIds);
    for (const hit of transferHits) {
      const key = `${hit.routeA}_${hit.routeB}_${hit.fromStopId}_${hit.toStopId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const option = await buildTransferOption(hit, minsToHHMM(nowMins), refMins);
      if (option && isValidResult(option, toIds)) results.push(option);
      if (results.length >= 3) break;
    }
  }

  if (!results.length) {
    const demoNote = !includeDemo ? ' (real routes only — add ?includeDemo=true to include demo routes)' : '';
    return { count: 0, data: [], message: `No real route found from "${fromQuery}" to "${toQuery}"${demoNote}` };
  }

  // Door-to-door walk legs: prepend a walk from the origin address to the boarding
  // stop, and append a walk from the alighting stop to the destination address.
  if (fromCoords || toCoords) {
    for (const r of results) {
      const accessM = fromCoords && r.fromStop
        ? Math.round(haversineMeters(fromCoords.lat, fromCoords.lng, r.fromStop.lat, r.fromStop.lng)) : 0;
      const egressM = toCoords && r.toStop
        ? Math.round(haversineMeters(r.toStop.lat, r.toStop.lng, toCoords.lat, toCoords.lng)) : 0;
      const accessMin = Math.max(0, Math.round(accessM / WALK_MPM));
      const egressMin = Math.max(0, Math.round(egressM / WALK_MPM));

      if (accessMin > 0) {
        r.legs = [{ type: 'walk', from: fromQuery, toStop: r.fromStop.name, distanceMeters: accessM, walkMinutes: accessMin }, ...(r.legs || [])];
      }
      if (egressMin > 0) {
        r.legs = [...(r.legs || []), { type: 'walk', fromStop: r.toStop.name, to: toQuery, distanceMeters: egressM, walkMinutes: egressMin }];
      }
      r.summary.walkMinutes     = accessMin + egressMin;
      r.summary.durationMinutes = (r.summary.durationMinutes || 0) + accessMin + egressMin;
      r.summary.doorToDoor      = true;
      r.summary.accessWalk      = accessMin ? { minutes: accessMin, meters: accessM, toStop: r.fromStop.name } : null;
      r.summary.egressWalk      = egressMin ? { minutes: egressMin, meters: egressM, fromStop: r.toStop.name } : null;
    }
  }

  // "Arrive by" → keep only options that arrive at/before the target time,
  // preferring the latest such departure (closest to the deadline).
  let filtered = results;
  if (mode === 'arrive' && targetMins != null) {
    const arrivingInTime = results.filter(r => {
      const arr = parseTimeToMins(r.summary?.arrivalTime);
      return arr != null && arr <= targetMins;
    });
    if (arrivingInTime.length) {
      arrivingInTime.sort((a, b) =>
        (parseTimeToMins(b.summary.arrivalTime) ?? 0) - (parseTimeToMins(a.summary.arrivalTime) ?? 0));
      filtered = arrivingInTime;
    }
  }

  // Apply the requested sort strategy (fastest / fewest_changes / least_walking / best)
  sortJourneys(filtered, sort);

  // Limit after sorting
  const final = filtered.slice(0, 9);
  return { count: final.length, data: final, sort, mode };
}

// GET /api/journeys/search?from=Sonatubes&to=Kabuga
router.get('/search', async (req, res, next) => {
  try {
    const { from, to, time, mode, sort, includeDemo,
            fromLat, fromLng, toLat, toLng } = req.query;
    if (!from || !to) return res.status(400).json({ success: false, error: 'from and to are required' });
    const fromCoords = (fromLat && fromLng) ? { lat: Number(fromLat), lng: Number(fromLng) } : null;
    const toCoords   = (toLat && toLng)     ? { lat: Number(toLat),   lng: Number(toLng)   } : null;
    const result = await searchJourneys(from, to, {
      time:        time || null,
      mode:        mode === 'arrive' ? 'arrive' : 'depart',
      sort:        sort || 'best',
      includeDemo: includeDemo === 'true',
      fromCoords, toCoords,
    });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// POST /api/journeys/search (frontend compatibility)
router.post('/search', async (req, res, next) => {
  try {
    const { origin, destination, departureTime, arriveBy, time, sort } = req.body;
    if (!origin || !destination) return res.status(400).json({ success: false, error: 'origin and destination required' });

    // Accept either an explicit HH:MM `time`, or an ISO `departureTime`/`arriveBy`.
    let refTime = time || null;
    let mode    = 'depart';
    if (!refTime && arriveBy)      { refTime = new Date(arriveBy).toTimeString().slice(0, 5);      mode = 'arrive'; }
    else if (!refTime && departureTime) { refTime = new Date(departureTime).toTimeString().slice(0, 5); mode = 'depart'; }

    let fromLabel = origin.label || '';
    let toLabel   = destination.label || '';

    if (origin.type === 'stop' && origin.stopId) {
      const { data } = await supabase.from('stops').select('stop_name').eq('id', origin.stopId).maybeSingle();
      if (data) fromLabel = data.stop_name;
    }
    if (destination.type === 'stop' && destination.stopId) {
      const { data } = await supabase.from('stops').select('stop_name').eq('id', destination.stopId).maybeSingle();
      if (data) toLabel = data.stop_name;
    }

    // Geocoded place/address endpoints carry coordinates → door-to-door planning.
    const fromCoords = (origin.type === 'place' && Number.isFinite(origin.lat) && Number.isFinite(origin.lng))
      ? { lat: Number(origin.lat), lng: Number(origin.lng) } : null;
    const toCoords = (destination.type === 'place' && Number.isFinite(destination.lat) && Number.isFinite(destination.lng))
      ? { lat: Number(destination.lat), lng: Number(destination.lng) } : null;

    if (!fromLabel || !toLabel) return res.json({ success: true, data: { results: [], count: 0 } });

    const result = await searchJourneys(fromLabel, toLabel, { time: refTime, mode, sort: sort || 'best', fromCoords, toCoords });
    res.json({ success: true, data: { results: result.data, count: result.count, message: result.message, sort: result.sort, mode: result.mode } });
  } catch (err) { next(err); }
});

module.exports = router;
