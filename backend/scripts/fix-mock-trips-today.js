/**
 * MOVEXA — Fix MOCK trips + bus_locations for today.
 * Safe: only touches rows whose route_code starts with MOCK/DEMO.
 * Run:  npm run fix:mock-trips
 *
 * What it does:
 *  1. Recomputes trip status for today's MOCK/DEMO trips (active/scheduled/completed)
 *  2. Deletes and recreates bus_locations for currently active MOCK buses
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');
const { interpolatePolyline, calcBearing } = require('../src/utils/geo');

function HHMMtoMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToHHMM(m) {
  m = Math.max(0, Math.floor(m) % (24 * 60));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

async function run() {
  const today   = new Date().toISOString().split('T')[0];
  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  console.log(`\n▶ Fix MOCK trips for ${today} — current time ${minsToHHMM(nowMins)}`);

  // ── 1. Get MOCK/DEMO route IDs ─────────────────────────────────────────────
  const { data: mockRoutes } = await supabase
    .from('routes')
    .select('id,route_code,estimated_duration_minutes')
    .or('route_code.ilike.MOCK%,route_code.ilike.DEMO%');

  if (!mockRoutes?.length) { console.error('No MOCK/DEMO routes found. Run seed:mock-transport first.'); process.exit(1); }
  const mockRouteIds = mockRoutes.map(r => r.id);
  const durationByRoute = Object.fromEntries(mockRoutes.map(r => [r.id, r.estimated_duration_minutes || 60]));
  console.log(`  Found ${mockRoutes.length} MOCK/DEMO routes`);

  // ── 2. Recompute trip status for today's MOCK trips ────────────────────────
  const { data: todayTrips } = await supabase
    .from('trips')
    .select('id,route_id,start_time,status')
    .in('route_id', mockRouteIds)
    .eq('service_date', today);

  let updated = 0;
  for (const trip of (todayTrips || [])) {
    const depMins = HHMMtoMins(trip.start_time);
    const dur     = durationByRoute[trip.route_id] || 60;
    const newStatus =
      depMins > nowMins + 2       ? 'scheduled'  // future
      : depMins + dur < nowMins - 5 ? 'completed' // fully past
      :                               'active';   // currently running

    if (newStatus !== trip.status) {
      await supabase.from('trips').update({ status: newStatus }).eq('id', trip.id);
      updated++;
    }
  }
  console.log(`  ✓ Trip statuses recomputed (${updated} updated, ${todayTrips?.length || 0} total)`);

  // ── 3. Get active MOCK trips after status update ───────────────────────────
  const { data: activeTrips } = await supabase
    .from('trips')
    .select('id,bus_id,route_id,start_time,delay_minutes,routes(estimated_duration_minutes)')
    .in('route_id', mockRouteIds)
    .eq('service_date', today)
    .eq('status', 'active');

  if (!activeTrips?.length) {
    console.log('  ⚠  No active MOCK trips — creating new trips for current window...');

    // Get MOCK buses grouped by route
    const { data: mockBuses } = await supabase
      .from('buses').select('id,bus_code,current_route_id').ilike('bus_code', 'MOCK%');
    const busesByRoute = {};
    for (const b of (mockBuses || [])) {
      if (!busesByRoute[b.current_route_id]) busesByRoute[b.current_route_id] = [];
      busesByRoute[b.current_route_id].push(b.id);
    }

    // Clear old MOCK bus_locations
    const mockBusIds = (mockBuses || []).map(b => b.id);
    if (mockBusIds.length) await supabase.from('bus_locations').delete().in('bus_id', mockBusIds);

    // Get schedules in ±3h window for MOCK routes
    const winFrom = minsToHHMM(Math.max(0, nowMins - 180));
    const winTo   = minsToHHMM(Math.min(22 * 60, nowMins + 180));
    const { data: windowScheds } = await supabase
      .from('schedules')
      .select('id,route_id,departure_time,arrival_time')
      .in('route_id', mockRouteIds)
      .eq('is_active', true)
      .gte('departure_time', winFrom)
      .lte('departure_time', winTo);

    // Delete today's MOCK trips and recreate for this window
    await supabase.from('trips').delete().in('route_id', mockRouteIds).eq('service_date', today);

    const newTrips = [];
    const busCtrs  = {};
    for (const s of (windowScheds || [])) {
      const depM   = HHMMtoMins(s.departure_time);
      const dur    = durationByRoute[s.route_id] || 60;
      const buses  = busesByRoute[s.route_id] || [];
      if (!buses.length) continue;
      const cnt    = busCtrs[s.route_id] || 0;
      busCtrs[s.route_id] = cnt + 1;
      const busId  = buses[cnt % buses.length];
      const status = depM + dur < nowMins - 5  ? 'completed'
                   : depM > nowMins + 2         ? 'scheduled'
                   :                              'active';
      newTrips.push({ route_id: s.route_id, bus_id: busId, schedule_id: s.id,
        start_time: s.departure_time, end_time: s.arrival_time, status,
        delay_minutes: 0, service_date: today });
    }

    for (let i = 0; i < newTrips.length; i += 100) {
      const { error } = await supabase.from('trips').insert(newTrips.slice(i, i + 100));
      if (error) console.error('  Trip insert error:', error.message);
    }
    console.log(`  ✓ Created ${newTrips.length} trips (${newTrips.filter(t=>t.status==='active').length} active)`);

    // Re-fetch active trips for bus_locations
    const { data: freshActive } = await supabase
      .from('trips')
      .select('id,bus_id,route_id,start_time,delay_minutes,routes(estimated_duration_minutes)')
      .in('route_id', mockRouteIds)
      .eq('service_date', today)
      .eq('status', 'active');

    if (!freshActive?.length) {
      console.log('  ⚠  Still no active trips — all MOCK buses are scheduled/future');
      return;
    }

    // Re-assign for bus_locations creation below
    activeTrips.push(...freshActive);
  }

  // ── 4. Load route paths for active trips ──────────────────────────────────
  const routeIdsNeeded = [...new Set(activeTrips.map(t => t.route_id))];
  const { data: pathRows } = await supabase
    .from('route_paths').select('route_id,coordinates').in('route_id', routeIdsNeeded);
  const pathByRoute = Object.fromEntries((pathRows || []).map(p => [p.route_id, p.coordinates]));

  // Load route stops for next_stop_id
  const { data: rsRows } = await supabase
    .from('route_stops').select('route_id,stop_order,stop_id')
    .in('route_id', routeIdsNeeded).order('stop_order');
  const stopsByRoute = {};
  for (const rs of (rsRows || [])) {
    if (!stopsByRoute[rs.route_id]) stopsByRoute[rs.route_id] = [];
    stopsByRoute[rs.route_id].push(rs);
  }

  // ── 5. Delete old MOCK bus_locations and insert fresh ones ─────────────────
  const mockBusIds = activeTrips.map(t => t.bus_id);
  await supabase.from('bus_locations').delete().in('bus_id', mockBusIds);

  const SPEED_PATTERN = [14, 18, 12, 20, 16, 22, 13, 19, 15, 17, 11, 21];
  const locations = [];

  for (let i = 0; i < activeTrips.length; i++) {
    const trip   = activeTrips[i];
    const coords = pathByRoute[trip.route_id];
    if (!coords || coords.length < 2) continue;

    const dur     = trip.routes?.estimated_duration_minutes || 60;
    const depMins = HHMMtoMins(trip.start_time);
    const elapsed = nowMins - depMins;
    const progress = Math.min(0.97, Math.max(0.02, elapsed / Math.max(1, dur)));

    // Interpolate position along path
    const n      = coords.length;
    const rawIdx = progress * (n - 1);
    const posIdx = Math.min(n - 2, Math.floor(rawIdx));
    const frac   = rawIdx - posIdx;
    const lng    = coords[posIdx][0] + (coords[posIdx + 1][0] - coords[posIdx][0]) * frac;
    const lat    = coords[posIdx][1] + (coords[posIdx + 1][1] - coords[posIdx][1]) * frac;
    const nxtPt  = coords[Math.min(posIdx + 1, n - 1)];
    const heading = calcBearing([lng, lat], nxtPt);

    const stops    = stopsByRoute[trip.route_id] || [];
    const stopIdx  = Math.min(stops.length - 1, Math.floor(progress * stops.length));
    const nextStop = stops[Math.min(stopIdx + 1, stops.length - 1)];
    const speedKph = SPEED_PATTERN[i % SPEED_PATTERN.length];

    locations.push({
      bus_id:              trip.bus_id,
      trip_id:             trip.id,
      latitude:            parseFloat(lat.toFixed(7)),
      longitude:           parseFloat(lng.toFixed(7)),
      speed_kph:           speedKph,
      heading:             parseFloat(heading.toFixed(1)),
      progress_percentage: parseFloat((progress * 100).toFixed(2)),
      next_stop_id:        nextStop?.stop_id || null,
      recorded_at:         now.toISOString(),
    });
  }

  if (locations.length) {
    const { error } = await supabase.from('bus_locations').insert(locations);
    if (error) console.error('  bus_locations insert error:', error.message);
    else console.log(`  ✓ ${locations.length} fresh bus_locations created for active MOCK trips`);
  }

  console.log('\n✅ MOCK trips fixed. Test:');
  console.log('   GET /api/vehicles/live?routeCode=MOCK101F');
  console.log('   GET /api/journeys/search?from=Sonatubes&to=Kabuga\n');
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
