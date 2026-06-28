/**
 * Seed active trips for today — one trip per schedule that falls within current ±2h window.
 * Also seeds a full day of trips for simulation purposes.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

function HHMMtoMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

async function run() {
  console.log('=== Seeding trips ===\n');

  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  // Delete today's trips
  await supabase.from('trips').delete().eq('service_date', today);

  const { data: schedules } = await supabase
    .from('schedules')
    .select('id,route_id,departure_time,arrival_time')
    .eq('is_active', true)
    .limit(5000);

  if (!schedules?.length) { console.error('No schedules. Run seed-schedules first.'); process.exit(1); }

  const { data: buses }   = await supabase.from('buses').select('id,current_route_id').eq('status','active');
  const { data: drivers } = await supabase.from('drivers').select('id,assigned_bus_id').eq('status','available');

  // Index buses by route
  const busByRoute = {};
  for (const b of (buses || [])) {
    if (!busByRoute[b.current_route_id]) busByRoute[b.current_route_id] = [];
    busByRoute[b.current_route_id].push(b.id);
  }
  const busCounters = {};

  // Index drivers
  const driverPool = (drivers || []).map(d => d.id);
  let driverIdx = 0;

  const trips = [];
  for (const sched of schedules) {
    const depMins = HHMMtoMins(sched.departure_time);
    // Only trips that start within the past 4h or next 4h from now
    if (depMins < nowMins - 240 || depMins > nowMins + 240) continue;

    const routeBuses = busByRoute[sched.route_id] || [];
    if (!routeBuses.length) continue;

    const cnt = busCounters[sched.route_id] || 0;
    const busId = routeBuses[cnt % routeBuses.length];
    busCounters[sched.route_id] = cnt + 1;

    const driverId = driverPool[driverIdx % driverPool.length] || null;
    driverIdx++;

    const depMins_ = HHMMtoMins(sched.departure_time);
    let status = 'scheduled';
    if (depMins_ <= nowMins && depMins_ >= nowMins - 120) status = 'active';
    if (depMins_ < nowMins - 120) status = 'completed';

    trips.push({
      route_id:     sched.route_id,
      bus_id:       busId,
      driver_id:    driverId,
      schedule_id:  sched.id,
      start_time:   sched.departure_time,
      end_time:     sched.arrival_time,
      status,
      delay_minutes: 0,
      service_date:  today,
    });
  }

  const batchSize = 100;
  let total = 0;
  for (let i = 0; i < trips.length; i += batchSize) {
    const { error } = await supabase.from('trips').insert(trips.slice(i, i + batchSize));
    if (error) console.error(`  Batch error: ${error.message}`);
    else total += Math.min(batchSize, trips.length - i);
  }

  const active = trips.filter(t => t.status === 'active').length;
  console.log(`✓ Created ${total} trips (${active} active now)`);
}

run().catch(err => { console.error(err); process.exit(1); });
