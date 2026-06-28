/**
 * Seed demo corridors for major Kigali landmarks.
 * Creates real GPS-located stops and routes so the journey planner works
 * for Downtown ↔ Sonatubes ↔ Rwandex ↔ Kabuga and similar pairs.
 * Idempotent — safe to run multiple times.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

// Verified Kigali GPS coordinates (accurate east–west spread)
const STOPS = [
  { code: 'DEMO_DOWNTOWN',    name: 'DOWNTOWN BUS TERMINAL',   lat: -1.9441, lng: 30.0619 },
  { code: 'DEMO_NYABUGOGO',   name: 'NYABUGOGO BUS TERMINAL',  lat: -1.9350, lng: 30.0509 },
  { code: 'DEMO_SONATUBES',   name: 'SONATUBES',               lat: -1.9441, lng: 30.0831 },
  { code: 'DEMO_RWANDEX',     name: 'RWANDEX',                 lat: -1.9498, lng: 30.0952 },
  { code: 'DEMO_KABUGA',      name: 'KABUGA BUS TERMINAL',     lat: -1.9448, lng: 30.1737 }, // ~13km east of Downtown
  { code: 'DEMO_KIMIRONKO',   name: 'KIMIRONKO BUS TERMINAL',  lat: -1.9326, lng: 30.1044 },
  { code: 'DEMO_REMERA',      name: 'REMERA STATION',          lat: -1.9535, lng: 30.1085 },
  { code: 'DEMO_NYAMIRAMBO', name: 'NYAMIRAMBO BUS TERMINAL', lat: -1.9732, lng: 30.0494 },
];

// Corridors: each defines a route with ordered stop codes
// DEMO101F covers: Downtown→Nyabugogo→Sonatubes→Rwandex→Kabuga
// DEMO201F covers: Downtown→Remera→Kimironko
// DEMO201R covers: Kimironko→Remera→Downtown
// DEMO301F covers: Nyabugogo→Sonatubes→Rwandex→Kabuga
const CORRIDORS = [
  {
    code:  'DEMO101F',
    name:  'Downtown – Sonatubes – Rwandex – Kabuga',
    color: '#0EA5A3',
    stops: ['DEMO_DOWNTOWN','DEMO_NYABUGOGO','DEMO_SONATUBES','DEMO_RWANDEX','DEMO_KABUGA'],
  },
  {
    code:  'DEMO201F',
    name:  'Downtown – Remera – Kimironko',
    color: '#2563EB',
    stops: ['DEMO_DOWNTOWN','DEMO_REMERA','DEMO_KIMIRONKO'],
  },
  {
    code:  'DEMO201R',
    name:  'Kimironko – Remera – Downtown',
    color: '#2563EB',
    stops: ['DEMO_KIMIRONKO','DEMO_REMERA','DEMO_DOWNTOWN'],
  },
  {
    code:  'DEMO301F',
    name:  'Nyabugogo – Sonatubes – Rwandex – Kabuga',
    color: '#22C55E',
    stops: ['DEMO_NYABUGOGO','DEMO_SONATUBES','DEMO_RWANDEX','DEMO_KABUGA'],
  },
  {
    code:  'DEMO401F',
    name:  'Nyabugogo – Nyamirambo',
    color: '#F59E0B',
    stops: ['DEMO_NYABUGOGO','DEMO_NYAMIRAMBO'],
  },
  {
    code:  'DEMO501F',
    name:  'Downtown – Nyabugogo – Nyamirambo',
    color: '#8B5CF6',
    stops: ['DEMO_DOWNTOWN','DEMO_NYABUGOGO','DEMO_NYAMIRAMBO'],
  },
];

function haverKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function run() {
  console.log('=== Seeding demo corridors ===\n');

  // 1. Upsert stops
  const { data: upsertedStops, error: se } = await supabase
    .from('stops')
    .upsert(STOPS.map(s => ({ stop_code: s.code, stop_name: s.name, latitude: s.lat, longitude: s.lng, is_active: true })), { onConflict: 'stop_code' })
    .select('id,stop_code');
  if (se) { console.error('Stop upsert error:', se.message); process.exit(1); }

  const stopById = {};
  for (const s of upsertedStops) stopById[s.stop_code] = s.id;
  console.log(`✓ Upserted ${upsertedStops.length} demo stops`);

  for (const corridor of CORRIDORS) {
    // 2. Upsert route
    const stopCodes = corridor.stops;
    const stopObjects = stopCodes.map(c => STOPS.find(s => s.code === c));
    const totalKm = stopObjects.slice(0,-1).reduce((sum,s,i) => sum + haverKm(s.lat,s.lng,stopObjects[i+1].lat,stopObjects[i+1].lng), 0);
    const roadKm  = totalKm * 1.35; // road winding factor
    const durationMins = Math.round((roadKm / 15) * 60 + (stopCodes.length - 2) * 1.5); // 15 km/h + dwell

    const { data: route, error: re } = await supabase
      .from('routes')
      .upsert({
        route_code:                corridor.code,
        route_name:                corridor.name,
        origin_name:               stopObjects[0].name,
        destination_name:          stopObjects[stopObjects.length-1].name,
        color:                     corridor.color,
        text_color:                '#FFFFFF',
        status:                    'active',
        total_distance_km:         parseFloat(totalKm.toFixed(2)),
        estimated_duration_minutes: durationMins,
      }, { onConflict: 'route_code' })
      .select('id')
      .single();
    if (re) { console.error(`Route upsert error (${corridor.code}):`, re.message); continue; }

    const routeId = route.id;

    // 3. Delete old route_stops for this route, then insert fresh
    await supabase.from('route_stops').delete().eq('route_id', routeId);

    let cumDist = 0;
    const routeStops = stopCodes.map((code, i) => {
      if (i > 0) {
        const prev = stopObjects[i-1]; const cur = stopObjects[i];
        cumDist += haverKm(prev.lat, prev.lng, cur.lat, cur.lng);
      }
      return {
        route_id:                    routeId,
        stop_id:                     stopById[code],
        stop_order:                  i + 1,
        distance_from_start_km:      parseFloat(cumDist.toFixed(2)),
        estimated_minutes_from_start: Math.round((cumDist / 25) * 60),
      };
    });
    await supabase.from('route_stops').insert(routeStops);

    // 4. Upsert route_path (straight-line through stops)
    const coords = stopObjects.map(s => [s.lng, s.lat]);
    await supabase.from('route_paths').delete().eq('route_id', routeId);
    await supabase.from('route_paths').insert({ route_id: routeId, coordinates: coords, path_order: 1, distance_km: parseFloat(totalKm.toFixed(2)) });

    // 5. Create schedules 05:00-22:00 every 20 min
    await supabase.from('schedules').delete().eq('route_id', routeId);
    const schedules = [];
    for (let dep = 5*60; dep <= 22*60; dep += 20) {
      const arr = dep + durationMins;
      if (arr > 23*60+59) break;
      const hhmm = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
      schedules.push({ route_id: routeId, departure_time: hhmm(dep), arrival_time: hhmm(arr), is_active: true });
    }
    if (schedules.length) await supabase.from('schedules').insert(schedules);

    console.log(`✓ ${corridor.code}: ${stopCodes.length} stops, ${totalKm.toFixed(1)}km, ${durationMins}min, ${schedules.length} schedules`);
  }

  // 6. Seed trips for today
  const today = new Date().toISOString().split('T')[0];
  const now = new Date(); const nowMins = now.getHours()*60 + now.getMinutes();

  const { data: demoBuses } = await supabase.from('buses').select('id,current_route_id').eq('status','active').limit(20);
  const { data: demoRoutes } = await supabase.from('routes').select('id,route_code').like('route_code','DEMO%');

  for (const route of demoRoutes || []) {
    const { data: scheds } = await supabase.from('schedules').select('id,departure_time,arrival_time').eq('route_id', route.id).eq('is_active', true);
    const bus = demoBuses?.find(b => b.current_route_id === route.id) || demoBuses?.[0];
    const activeScheds = (scheds || []).filter(s => {
      const [h,m] = s.departure_time.split(':').map(Number);
      const dm = h*60+m;
      return dm >= nowMins-120 && dm <= nowMins+120;
    }).slice(0,4);

    if (activeScheds.length && bus) {
      const trips = activeScheds.map((s,i) => {
        const [h,m] = s.departure_time.split(':').map(Number);
        const dm = h*60+m;
        return { route_id: route.id, bus_id: bus.id, schedule_id: s.id, start_time: s.departure_time, end_time: s.arrival_time, status: dm <= nowMins ? 'active' : 'scheduled', delay_minutes: 0, service_date: today };
      });
      // Delete today's existing demo trips for this route, then insert
      await supabase.from('trips').delete().eq('route_id', route.id).eq('service_date', today);
      await supabase.from('trips').insert(trips);
    }
  }

  // 7. Update buses to use demo routes
  if (demoRoutes?.length && demoBuses?.length) {
    for (let i = 0; i < Math.min(demoRoutes.length, 4); i++) {
      await supabase.from('buses').update({ current_route_id: demoRoutes[i].id }).eq('id', demoBuses[i].id);
    }
  }

  console.log('\n✓ Demo corridors seeded. Run: npm run data:health');
}

run().catch(err => { console.error(err.message); process.exit(1); });
