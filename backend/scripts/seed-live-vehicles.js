/**
 * Seed initial bus_locations for all active trips.
 * Positions are calculated by interpolating each route's path based on
 * how far into the trip the current time is.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');
const { interpolatePolyline, calcBearing } = require('../src/utils/geo');

function HHMMtoMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function run() {
  console.log('=== Seeding live bus locations ===\n');

  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Get active trips with route path
  const { data: trips } = await supabase
    .from('trips')
    .select('id,bus_id,route_id,start_time,end_time,routes(estimated_duration_minutes)')
    .eq('status', 'active')
    .limit(200);

  if (!trips?.length) {
    console.log('No active trips found. Run seed-trips first.');
    return;
  }

  // Load route paths
  const routeIds = [...new Set(trips.map(t => t.route_id))];
  const { data: paths } = await supabase
    .from('route_paths')
    .select('route_id,coordinates')
    .in('route_id', routeIds);

  const pathByRoute = {};
  for (const p of (paths || [])) pathByRoute[p.route_id] = p.coordinates;

  // Load first stop per route for next_stop
  const { data: firstStops } = await supabase
    .from('route_stops')
    .select('route_id,stop_id')
    .in('route_id', routeIds)
    .order('stop_order')
    .limit(routeIds.length * 3);

  const firstStopByRoute = {};
  for (const rs of (firstStops || [])) {
    if (!firstStopByRoute[rs.route_id]) firstStopByRoute[rs.route_id] = rs.stop_id;
  }

  // Clear old locations
  await supabase.from('bus_locations').delete().gte('recorded_at', '2000-01-01');

  const locations = [];
  for (let i = 0; i < trips.length; i++) {
    const trip     = trips[i];
    const coords   = pathByRoute[trip.route_id];
    if (!coords || coords.length < 2) continue;

    const startMins  = HHMMtoMins(trip.start_time);
    const duration   = trip.routes?.estimated_duration_minutes || 30;
    const elapsed    = nowMins - startMins;
    const progress   = Math.min(Math.max(elapsed / duration, 0), 1);

    const pos     = interpolatePolyline(coords, progress) || coords[0];
    const nextIdx = Math.min(Math.floor(progress * (coords.length - 1)) + 1, coords.length - 1);
    const heading = calcBearing(pos, coords[nextIdx]);

    // Vary speed + tiny noise per bus
    const speedKph = 15 + (i % 20) + Math.random() * 10;

    locations.push({
      bus_id:              trip.bus_id,
      trip_id:             trip.id,
      latitude:            pos[1],
      longitude:           pos[0],
      speed_kph:           parseFloat(speedKph.toFixed(1)),
      heading:             parseFloat(heading.toFixed(1)),
      progress_percentage: parseFloat((progress * 100).toFixed(2)),
      next_stop_id:        firstStopByRoute[trip.route_id] || null,
      recorded_at:         now.toISOString(),
    });
  }

  const batchSize = 50;
  let total = 0;
  for (let i = 0; i < locations.length; i += batchSize) {
    const { error } = await supabase.from('bus_locations').insert(locations.slice(i, i + batchSize));
    if (error) console.error(`  Error: ${error.message}`);
    else total += Math.min(batchSize, locations.length - i);
  }

  console.log(`✓ Seeded ${total} live bus locations from ${trips.length} active trips`);
}

run().catch(err => { console.error(err); process.exit(1); });
