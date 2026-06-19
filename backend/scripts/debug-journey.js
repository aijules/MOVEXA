require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

(async () => {
  const { data: sStops } = await supabase.from('stops').select('id,stop_name').ilike('stop_name','%SONATUB%');
  const { data: kStops } = await supabase.from('stops').select('id,stop_name').ilike('stop_name','%KABUGA%');
  console.log('\nSonatube stops:', sStops?.map(s=>s.stop_name));
  console.log('Kabuga stops:', kStops?.map(s=>s.stop_name));

  const sIds = (sStops||[]).map(s=>s.id);
  const kIds = (kStops||[]).map(s=>s.id);

  const { data: sRs } = await supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', sIds);
  const { data: kRs } = await supabase.from('route_stops').select('route_id,stop_id,stop_order').in('stop_id', kIds);

  const sRoutes = new Map();
  for (const r of sRs||[]) { if (!sRoutes.has(r.route_id)) sRoutes.set(r.route_id, { stopId: r.stop_id, order: r.stop_order }); }
  const kRoutes = new Map();
  for (const r of kRs||[]) { if (!kRoutes.has(r.route_id)) kRoutes.set(r.route_id, { stopId: r.stop_id, order: r.stop_order }); }

  console.log('\nRoutes with Sonatube stops:', sRoutes.size);
  console.log('Routes with Kabuga stops:', kRoutes.size);

  const common = [];
  for (const [rid, sEntry] of sRoutes) {
    const kEntry = kRoutes.get(rid);
    if (kEntry !== undefined) {
      common.push({ routeId: rid, sOrder: sEntry.order, kOrder: kEntry.order, sStopId: sEntry.stopId, kStopId: kEntry.stopId });
    }
  }

  if (!common.length) {
    console.log('\n⚠  NO routes have both Sonatube AND Kabuga stops in route_stops.');
    console.log('   Kabuga stops NOT in any route_stops:');
    for (const s of kStops||[]) {
      const inRs = kRs?.find(r=>r.stop_id===s.id);
      if (!inRs) console.log('   -', s.stop_name, '(orphan)');
    }
    console.log('\n   Sonatube stops in routes:');
    for (const [rid, e] of sRoutes) {
      const sName = sStops?.find(s=>s.id===e.stopId)?.stop_name;
      console.log('  ', rid, sName, 'order='+e.order);
    }
  } else {
    const { data: routes } = await supabase.from('routes').select('id,route_code,route_name').in('id', common.map(c=>c.routeId));
    const rm = new Map(routes.map(r=>[r.id,r]));
    console.log('\nDirect routes found:');
    for (const c of common) {
      const r = rm.get(c.routeId);
      const sName = sStops?.find(s=>s.id===c.sStopId)?.stop_name;
      const kName = kStops?.find(s=>s.id===c.kStopId)?.stop_name;
      console.log(' ', r?.route_code, '|', sName, '(order', c.sOrder, ') ->', kName, '(order', c.kOrder, ') valid=', c.sOrder < c.kOrder);
    }
  }
})().catch(e=>{ console.error(e.message); process.exit(1); });
