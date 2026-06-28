/**
 * Supabase Bus Simulation Service
 * Moves buses along route paths, writes to bus_locations, emits via Socket.IO.
 */
const { supabase } = require('../config/supabase');
const { interpolatePolyline, calcBearing } = require('../utils/geo');
const { HHMMtoMinutes } = require('../utils/time');
const { calculateETA, calcTripProgress, delayLabel } = require('./eta.service');

let io = null;
let interval = null;

// In-memory cache to avoid reloading paths every tick
const pathCache = {};   // route_id -> [[lng,lat],...]
const stopCache  = {};  // route_id -> [{stop_id,stop_order,stops:{latitude,longitude,stop_name}}]

function setIO(socketIO) { io = socketIO; }

async function loadPaths(routeIds) {
  const missing = routeIds.filter(id => !pathCache[id]);
  if (!missing.length) return;
  const { data } = await supabase.from('route_paths').select('route_id,coordinates').in('route_id', missing);
  for (const p of (data || [])) pathCache[p.route_id] = p.coordinates;
}

async function loadStops(routeIds) {
  const missing = routeIds.filter(id => !stopCache[id]);
  if (!missing.length) return;
  const { data } = await supabase
    .from('route_stops')
    .select('route_id,stop_order,stop_id,stops(stop_name,latitude,longitude)')
    .in('route_id', missing)
    .order('stop_order');
  for (const rs of (data || [])) {
    if (!stopCache[rs.route_id]) stopCache[rs.route_id] = [];
    stopCache[rs.route_id].push(rs);
  }
}

/**
 * Compute live position of a trip based on current time.
 * Returns null if trip has no path or hasn't started.
 */
function computePosition(trip, coords) {
  if (!coords || coords.length < 2) return null;
  const now  = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const startMins = HHMMtoMinutes(trip.start_time);
  const duration  = trip.routes?.estimated_duration_minutes || 30;
  const progress  = calcTripProgress(startMins, duration, nowMins);

  const pos     = interpolatePolyline(coords, progress);
  if (!pos) return null;
  const nextIdx = Math.min(Math.floor(progress * (coords.length - 1)) + 1, coords.length - 1);
  const heading = calcBearing(pos, coords[nextIdx]);
  const speed   = 15 + (Math.random() * 20);

  return { pos, heading, progress, speed };
}

function findNextStop(routeId, progress) {
  const stops = stopCache[routeId] || [];
  if (!stops.length) return null;
  const idx = Math.min(stops.length - 1, Math.floor(progress * stops.length));
  return stops[idx];
}

async function tick() {
  const today   = new Date().toISOString().split('T')[0];
  const { data: trips } = await supabase
    .from('trips')
    .select('id,bus_id,route_id,start_time,end_time,delay_minutes,routes(estimated_duration_minutes)')
    .eq('status', 'active')
    .eq('service_date', today)
    .limit(100);

  if (!trips?.length) return;

  const routeIds = [...new Set(trips.map(t => t.route_id))];
  await Promise.all([loadPaths(routeIds), loadStops(routeIds)]);

  const locations = [];
  const socketPayloads = [];

  for (const trip of trips) {
    const coords = pathCache[trip.route_id];
    const result = computePosition(trip, coords);
    if (!result) continue;

    const { pos, heading, progress, speed } = result;
    const nextStopEntry = findNextStop(trip.route_id, progress);
    const delayMins = trip.delay_minutes || 0;

    locations.push({
      bus_id:              trip.bus_id,
      trip_id:             trip.id,
      latitude:            parseFloat(pos[1].toFixed(7)),
      longitude:           parseFloat(pos[0].toFixed(7)),
      speed_kph:           parseFloat(speed.toFixed(1)),
      heading:             parseFloat(heading.toFixed(1)),
      progress_percentage: parseFloat((progress * 100).toFixed(2)),
      next_stop_id:        nextStopEntry?.stop_id || null,
      recorded_at:         new Date().toISOString(),
    });

    socketPayloads.push({
      busId:    trip.bus_id,
      tripId:   trip.id,
      routeId:  trip.route_id,
      lat:      pos[1],
      lng:      pos[0],
      heading,
      speedKph: speed,
      progress: parseFloat((progress * 100).toFixed(1)),
      delayMinutes: delayMins,
      delayStatus:  delayLabel(delayMins),
      nextStop: nextStopEntry?.stops ? {
        id:   nextStopEntry.stop_id,
        name: nextStopEntry.stops.stop_name,
      } : null,
    });
  }

  if (locations.length) {
    // Upsert by bus_id — keep only latest location per bus
    for (const loc of locations) {
      await supabase.from('bus_locations')
        .upsert(loc, { onConflict: 'bus_id' })
        .then(({ error }) => { if (error) { /* silent */ } });
    }
  }

  if (io && socketPayloads.length) {
    for (const p of socketPayloads) {
      io.emit('vehicle:location', p);
    }
  }
}

function startSimulation() {
  if (interval) return;
  tick(); // immediate first tick
  interval = setInterval(tick, 5000);
  console.log('✓ Bus simulation started (Supabase)');
}

function stopSimulation() {
  if (interval) { clearInterval(interval); interval = null; }
}

module.exports = { setIO, startSimulation, stopSimulation, computePosition, pathCache, stopCache };
