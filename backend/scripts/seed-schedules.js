/**
 * Create schedules 05:00–22:00 every 20 minutes for each route.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

function minsToHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

async function run() {
  console.log('=== Seeding schedules ===\n');

  const { data: routes } = await supabase.from('routes').select('id,estimated_duration_minutes');
  if (!routes?.length) { console.error('No routes. Run import-routes first.'); process.exit(1); }

  await supabase.from('schedules').delete().gte('created_at', '2000-01-01');

  const SERVICE_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const START_MIN    = 5 * 60;   // 05:00
  const END_MIN      = 22 * 60;  // 22:00
  const INTERVAL     = 20;       // minutes

  const schedules = [];
  for (const route of routes) {
    const duration = route.estimated_duration_minutes || 30;
    for (let dep = START_MIN; dep <= END_MIN; dep += INTERVAL) {
      const arr = dep + duration;
      if (arr > 23 * 60 + 59) break;
      schedules.push({
        route_id:       route.id,
        departure_time: minsToHHMM(dep),
        arrival_time:   minsToHHMM(arr),
        service_days:   SERVICE_DAYS,
        is_active:      true,
      });
    }
  }

  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < schedules.length; i += batchSize) {
    const { error } = await supabase.from('schedules').insert(schedules.slice(i, i + batchSize));
    if (error) console.error(`  Batch error: ${error.message}`);
    else total += Math.min(batchSize, schedules.length - i);
  }

  console.log(`✓ Created ${total} schedules across ${routes.length} routes`);
}

run().catch(err => { console.error(err); process.exit(1); });
