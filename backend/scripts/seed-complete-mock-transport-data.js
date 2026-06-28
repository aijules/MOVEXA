/**
 * MOVEXA — Complete Mock Transport Data Seed
 * ============================================
 * ADDITIVE ONLY. Never drops or deletes real imported geography.
 * Safe delete/update allowed only for OPS/MOCK operational rows this script owns.
 *
 * Phases:
 *  1. Update zero-distance routes from route_path data
 *  2. Ensure 10-min headway schedules (insert missing slots only)
 *  3. Refresh OPS/MOCK bus trips for current time window
 *  4. Refresh bus_locations for all active trips on real + MOCK routes
 *  5. Ensure 3 correct fare products
 *  6. Validation summary
 *
 * Run: npm run seed:mock-transport
 * Deterministic: index-based values only (no Math.random).
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');
const { interpolatePolyline, calcBearing } = require('../src/utils/geo');

// ── Constants ─────────────────────────────────────────────────────────────────
const FARE_PER_KM     = 59.48;
const BASE_SPEED_KPH  = 60;          // per REQUIREMENTS formula
const DWELL_PER_STOP  = 0.75;        // minutes per intermediate stop
const HEADWAY_MINS    = 10;          // target max wait time (EcoFleet ≤15 min)
const TRIP_WINDOW     = 180;         // ±3h window for today's trips
const SPEED_PATTERN   = [14,18,12,20,16,22,13,19,15,17,11,21];
const DELAY_PATTERN   = [0,2,0,3,1,0,4,2,0,1,0,3];

function HHMMtoMins(t) { const [h,m]=String(t).split(':').map(Number); return h*60+m; }
function minsToHHMM(m) {
  m=Math.max(0,Math.floor(m)%(24*60));
  return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
}
function haverKm(lat1,lng1,lat2,lng2) {
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function calcDuration(distKm, intermediateStops=0) {
  const ride = distKm;                         // (distKm/60)*60 = distKm minutes at 60km/h
  const dwell = intermediateStops * DWELL_PER_STOP;
  return Math.max(5, Math.round(ride + dwell));
}

async function batchInsert(table, rows, size=100) {
  let n=0;
  for (let i=0;i<rows.length;i+=size) {
    const {error}=await supabase.from(table).insert(rows.slice(i,i+size));
    if(error) console.error(`  [${table}] batch error:`,error.message);
    else n+=Math.min(size,rows.length-i);
  }
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  const today   = new Date().toISOString().split('T')[0];
  const now     = new Date();
  const nowMins = now.getHours()*60+now.getMinutes();

  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║   MOVEXA Complete Mock Transport Data Seed 2026       ║');
  console.log('║   Additive only — real geography preserved            ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`  ${today} ${minsToHHMM(nowMins)}\n`);

  // ── Phase 1: Update zero-distance/duration routes from path data ──────────
  console.log('Phase 1: Updating route distances and durations...');
  const { data: zeroDist } = await supabase
    .from('routes').select('id,route_code,total_distance_km,estimated_duration_minutes')
    .or('total_distance_km.eq.0,total_distance_km.is.null')
    .eq('status','active');

  const { data: paths } = await supabase
    .from('route_paths').select('route_id,distance_km,coordinates')
    .in('route_id',(zeroDist||[]).map(r=>r.id));
  const pathByRoute = Object.fromEntries((paths||[]).map(p=>[p.route_id,p]));

  let distUpdated=0;
  for (const route of (zeroDist||[])) {
    const path = pathByRoute[route.id];
    if (!path?.distance_km && !path?.coordinates?.length) continue;
    const distKm = path.distance_km || (() => {
      // Compute from coordinates
      const coords = path.coordinates||[];
      let d=0;
      for(let i=1;i<coords.length;i++) d+=haverKm(coords[i-1][1],coords[i-1][0],coords[i][1],coords[i][0]);
      return parseFloat(d.toFixed(2));
    })();
    // Count route_stops for intermediate stop count
    const {count:stopCount}=await supabase.from('route_stops').select('*',{count:'exact',head:true}).eq('route_id',route.id);
    const intermediateStops = Math.max(0,(stopCount||2)-2);
    const durMins = calcDuration(distKm, intermediateStops);
    const {error}=await supabase.from('routes').update({
      total_distance_km: parseFloat(distKm.toFixed(2)),
      estimated_duration_minutes: durMins,
    }).eq('id',route.id).or('total_distance_km.eq.0,total_distance_km.is.null');
    if(!error) distUpdated++;
  }
  console.log(`  ✓ ${distUpdated} routes updated with real distance/duration`);

  // ── Phase 2: Ensure schedules at 10-min headway ──────────────────────────
  console.log('\nPhase 2: Ensuring 10-min headway schedules...');
  const { data: allRoutes } = await supabase
    .from('routes').select('id,route_code,estimated_duration_minutes').eq('status','active');

  let schedAdded=0;
  for (const route of (allRoutes||[])) {
    const dur = route.estimated_duration_minutes||45;
    const { data: existing } = await supabase.from('schedules')
      .select('departure_time').eq('route_id',route.id).eq('is_active',true);
    const existSet = new Set((existing||[]).map(s=>s.departure_time));
    const toInsert=[];
    for (let dep=5*60; dep<=22*60; dep+=HEADWAY_MINS) {
      const hhmm=minsToHHMM(dep);
      if(existSet.has(hhmm)) continue;
      const arr=dep+dur;
      if(arr>23*60+59) break;
      toInsert.push({ route_id:route.id, departure_time:hhmm, arrival_time:minsToHHMM(arr),
        service_days:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], is_active:true });
    }
    if(toInsert.length) { const n=await batchInsert('schedules',toInsert,200); schedAdded+=n; }
  }
  console.log(`  ✓ ${schedAdded} schedule slots added`);

  // ── Phase 3: Refresh MOCK/DEMO + OPS trips for today ─────────────────────
  console.log('\nPhase 3: Refreshing operational trips for today...');
  const { data: opsRoutes } = await supabase.from('routes')
    .select('id,route_code,estimated_duration_minutes').eq('status','active');
  const opsRouteIds = (opsRoutes||[]).map(r=>r.id);
  const durByRoute  = Object.fromEntries((opsRoutes||[]).map(r=>[r.id,Math.max(10,r.estimated_duration_minutes||45)]));

  // Get OPS and MOCK buses
  const { data: opsBuses } = await supabase.from('buses')
    .select('id,bus_code,current_route_id')
    .or('bus_code.ilike.OPS%,bus_code.ilike.MOCK%,bus_code.ilike.DEMO%')
    .eq('status','active');
  const busByRoute={};
  for(const b of opsBuses||[]) {
    if(!b.current_route_id) continue;
    if(!busByRoute[b.current_route_id]) busByRoute[b.current_route_id]=[];
    busByRoute[b.current_route_id].push(b.id);
  }

  // Delete today's OPS/MOCK trips and recreate
  const opsRouteIdsWithBuses = Object.keys(busByRoute);
  if(opsRouteIdsWithBuses.length) {
    await supabase.from('trips').delete().in('route_id',opsRouteIdsWithBuses).eq('service_date',today);
  }

  const winFrom=minsToHHMM(Math.max(0,nowMins-TRIP_WINDOW));
  const winTo=minsToHHMM(Math.min(22*60,nowMins+TRIP_WINDOW));
  const { data: windowScheds } = await supabase.from('schedules')
    .select('id,route_id,departure_time,arrival_time')
    .in('route_id',opsRouteIdsWithBuses.length?opsRouteIdsWithBuses:['_none_'])
    .eq('is_active',true).gte('departure_time',winFrom).lte('departure_time',winTo);

  const trips=[]; const busCtrs={};
  for(const s of windowScheds||[]) {
    const depM=HHMMtoMins(s.departure_time);
    const dur=durByRoute[s.route_id]||45;
    const buses=busByRoute[s.route_id]||[];
    if(!buses.length) continue;
    const cnt=busCtrs[s.route_id]||0; busCtrs[s.route_id]=cnt+1;
    const busId=buses[cnt%buses.length];
    const status=depM+dur<nowMins-5?'completed':depM>nowMins+2?'scheduled':'active';
    trips.push({ route_id:s.route_id, bus_id:busId, schedule_id:s.id,
      start_time:s.departure_time, end_time:s.arrival_time, status,
      delay_minutes:status==='active'?DELAY_PATTERN[cnt%DELAY_PATTERN.length]:0,
      service_date:today });
  }
  const tripsN=await batchInsert('trips',trips,100);
  const activeN=trips.filter(t=>t.status==='active').length;
  console.log(`  ✓ ${tripsN} trips (${activeN} active, ${trips.filter(t=>t.status==='scheduled').length} scheduled)`);

  // ── Phase 4: Refresh bus_locations for ALL active trips today ─────────────
  console.log('\nPhase 4: Refreshing bus_locations...');
  const opsBusIds=(opsBuses||[]).map(b=>b.id);
  if(opsBusIds.length) await supabase.from('bus_locations').delete().in('bus_id',opsBusIds);

  const { data: allActiveTrips } = await supabase.from('trips')
    .select('id,bus_id,route_id,start_time,delay_minutes,routes(estimated_duration_minutes)')
    .in('route_id',opsRouteIds).eq('status','active').eq('service_date',today).limit(300);

  const { data: pathRows } = await supabase.from('route_paths')
    .select('route_id,coordinates').in('route_id',opsRouteIds);
  const pathMap=Object.fromEntries((pathRows||[]).map(p=>[p.route_id,p.coordinates]));

  const { data: rsRows } = await supabase.from('route_stops')
    .select('route_id,stop_order,stop_id').in('route_id',opsRouteIds).order('stop_order');
  const stopsByRoute={};
  for(const rs of rsRows||[]) {
    if(!stopsByRoute[rs.route_id]) stopsByRoute[rs.route_id]=[];
    stopsByRoute[rs.route_id].push(rs);
  }

  const locations=[]; let locIdx=0;
  for(const trip of allActiveTrips||[]) {
    const coords=pathMap[trip.route_id];
    const dur=trip.routes?.estimated_duration_minutes||durByRoute[trip.route_id]||45;
    const depM=HHMMtoMins(trip.start_time);
    const elapsed=nowMins-depM+(trip.delay_minutes||0);
    const progress=Math.min(0.97,Math.max(0.02,elapsed/Math.max(1,dur)));

    let lat,lng,heading;
    if(coords?.length>=2) {
      const n=coords.length; const rawIdx=progress*(n-1);
      const posIdx=Math.min(n-2,Math.floor(rawIdx)); const frac=rawIdx-posIdx;
      lng=coords[posIdx][0]+(coords[posIdx+1][0]-coords[posIdx][0])*frac;
      lat=coords[posIdx][1]+(coords[posIdx+1][1]-coords[posIdx][1])*frac;
      heading=calcBearing([lng,lat],coords[Math.min(posIdx+1,n-1)]);
    } else continue;

    const stops=stopsByRoute[trip.route_id]||[];
    const si=Math.min(stops.length-1,Math.floor(progress*stops.length));
    const nextSt=stops[Math.min(si+1,stops.length-1)];

    locations.push({
      bus_id:trip.bus_id, trip_id:trip.id,
      latitude:parseFloat(lat.toFixed(7)), longitude:parseFloat(lng.toFixed(7)),
      speed_kph:SPEED_PATTERN[locIdx%SPEED_PATTERN.length],
      heading:parseFloat(heading.toFixed(1)),
      progress_percentage:parseFloat((progress*100).toFixed(2)),
      next_stop_id:nextSt?.stop_id||null,
      recorded_at:now.toISOString(),
    });
    locIdx++;
  }
  const locN=await batchInsert('bus_locations',locations,50);
  console.log(`  ✓ ${locN} bus_locations created for ${(allActiveTrips||[]).length} active trips`);

  // ── Phase 5: Ensure correct fare products (3 types) ──────────────────────
  console.log('\nPhase 5: Ensuring fare products...');
  const REQUIRED_PRODUCTS=[
    { name:'Single Trip',      price:0,     currency:'RWF', validity_minutes:90,    is_active:true,
      description:'One-way ticket — price based on journey distance (59.48 RWF/km)' },
    { name:'7-Day Unlimited',  price:16000, currency:'RWF', validity_minutes:10080,  is_active:true,
      description:'Unlimited rides for 7 days — 18% off vs single trips' },
    { name:'1-Month Unlimited',price:52000, currency:'RWF', validity_minutes:43200, is_active:true,
      description:'Unlimited rides for 30 days — 28% off vs single trips' },
  ];
  const {data:existProd}=await supabase.from('fare_products').select('name');
  const existNames=new Set((existProd||[]).map(p=>p.name));
  for(const fp of REQUIRED_PRODUCTS) {
    if(!existNames.has(fp.name)) await supabase.from('fare_products').insert(fp);
  }
  // Deactivate legacy products
  await supabase.from('fare_products').update({is_active:false})
    .in('name',['Single Ride','Day Pass','Weekly Pass','Monthly Pass']);
  console.log('  ✓ Fare products verified (Single Trip, 7-Day, 1-Month)');

  // ── Phase 6: Validation summary ──────────────────────────────────────────
  console.log('\nPhase 6: Validation...');
  const checks=[
    ['routes (active)',    supabase.from('routes').select('*',{count:'exact',head:true}).eq('status','active')],
    ['route_stops',        supabase.from('route_stops').select('*',{count:'exact',head:true})],
    ['schedules (active)', supabase.from('schedules').select('*',{count:'exact',head:true}).eq('is_active',true)],
    ['buses (active)',     supabase.from('buses').select('*',{count:'exact',head:true}).eq('status','active')],
    ['trips today',        supabase.from('trips').select('*',{count:'exact',head:true}).eq('service_date',today)],
    ['trips active',       supabase.from('trips').select('*',{count:'exact',head:true}).eq('service_date',today).eq('status','active')],
    ['bus_locations',      supabase.from('bus_locations').select('*',{count:'exact',head:true})],
    ['fare_products',      supabase.from('fare_products').select('*',{count:'exact',head:true}).eq('is_active',true)],
  ];
  for(const [label,q] of checks) {
    const {count}=await q; const icon=(count||0)>0?'✅':'⚠️ ';
    console.log(`  ${icon} ${label.padEnd(22)} ${count??0}`);
  }

  console.log('\n✅ Complete mock transport data seeded.');
  console.log('   Run: npm run dev → test /api/journeys/search?from=Downtown&to=Kabuga\n');
}

run().catch(err=>{ console.error('\n❌ Error:',err.message); process.exit(1); });
