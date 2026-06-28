const router = require('express').Router();
const { supabase } = require('../config/supabase');

async function cnt(table, col, val) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (col) q = q.eq(col, val);
  const { count } = await q;
  return count || 0;
}

// GET /api/admin/dashboard  — live, consistent with the map (not static seed counts)
router.get('/dashboard', async (req, res, next) => {
  try {
    const { buildLiveVehicles } = require('./vehicles.routes');
    const [routes, stops, buses, incidents, scheduledTrips, live] = await Promise.all([
      cnt('routes'), cnt('stops'), cnt('buses'), cnt('incidents', 'status', 'open'),
      supabase.from('schedules').select('*', { count: 'exact', head: true }).eq('is_active', true).then(r => r.count || 0),
      buildLiveVehicles(),
    ]);
    // Running fleet = scheduled trips currently mid-route (provable from the timetable).
    const activeVehicles = live.length;
    const delayedTrips   = live.filter(v => v.delayStatus && v.delayStatus !== 'on_time').length;
    const onTime         = activeVehicles - delayedTrips;
    const activeTrips    = activeVehicles;            // one bus = one trip in progress
    const kmin = new Date(Date.now() + 2 * 3600 * 1000); const km = kmin.getUTCHours() * 60 + kmin.getUTCMinutes();
    const inService = km >= 300 && km <= 1320;

    const { data: adaptiveActions } = await supabase.from('adaptive_actions').select('id,action_type,severity,status,created_at').order('created_at',{ascending:false}).limit(5);
    const { data: recentIncidents } = await supabase.from('incidents').select('id,title,severity,status,starts_at').order('starts_at',{ascending:false}).limit(5);

    res.json({ success: true, data: { routes, stops, buses, scheduledTrips, activeVehicles, activeTrips, delayedTrips, onTime, incidents, inService, adaptiveActions: adaptiveActions||[], recentIncidents: recentIncidents||[] } });
  } catch (err) { next(err); }
});

// GET /api/admin/data-health
router.get('/data-health', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const counts = await Promise.all([
      cnt('routes'), cnt('stops'), cnt('route_stops'), cnt('route_paths'),
      cnt('schedules'), cnt('trips','service_date',today), cnt('buses','status','active'), cnt('bus_locations'),
    ]);
    const [routes, stops, routeStops, routePaths, schedules, trips, buses, activeVehicles] = counts;
    res.json({ success: true, data: { routes, stops, route_stops: routeStops, route_paths: routePaths, schedules, trips, buses, active_vehicles: activeVehicles } });
  } catch (err) { next(err); }
});

// GET /api/admin/routes
router.get('/routes', async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;
    let query = supabase.from('routes').select('id,route_code,route_name,origin_name,destination_name,color,status,total_distance_km,estimated_duration_minutes').order('route_code').limit(parseInt(limit));
    if (q) query = query.ilike('route_name', `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data||[], meta: { total: (data||[]).length } });
  } catch (err) { next(err); }
});

// GET /api/admin/stops
router.get('/stops', async (req, res, next) => {
  try {
    const { q, limit = 50 } = req.query;
    let query = supabase.from('stops').select('id,stop_code,stop_name,latitude,longitude,area,is_active').order('stop_name').limit(parseInt(limit));
    if (q) query = query.ilike('stop_name', `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// POST /api/admin/stops  — add a new stop
router.post('/stops', async (req, res, next) => {
  try {
    const { stop_name, latitude, longitude, area } = req.body;
    if (!stop_name || latitude == null || longitude == null) return res.status(400).json({ success: false, error: 'Name and coordinates required' });
    const code = (stop_name.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 16)) + '_' + Math.floor(Math.random() * 900 + 100);
    const { data, error } = await supabase.from('stops').insert({
      stop_code: code, stop_name: stop_name.trim(), latitude: Number(latitude), longitude: Number(longitude),
      area: area || null, is_active: true,
    }).select('id,stop_code,stop_name,latitude,longitude,area,is_active').single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /api/admin/stops/:id  — edit / deactivate a stop
router.patch('/stops/:id', async (req, res, next) => {
  try {
    const patch = {};
    ['stop_name', 'area', 'is_active'].forEach(k => { if (k in req.body) patch[k] = req.body[k]; });
    if ('latitude' in req.body) patch.latitude = Number(req.body.latitude);
    if ('longitude' in req.body) patch.longitude = Number(req.body.longitude);
    const { data, error } = await supabase.from('stops').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// DELETE /api/admin/stops/:id  — remove a stop
router.delete('/stops/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('stops').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/admin/drivers/:id  — update driver status / assignment
router.patch('/drivers/:id', async (req, res, next) => {
  try {
    const patch = {};
    ['status', 'full_name', 'phone'].forEach(k => { if (k in req.body) patch[k] = req.body[k]; });
    const { data, error } = await supabase.from('drivers').update(patch).eq('id', req.params.id)
      .select('id,full_name,phone,status,buses(plate_number)').single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/admin/buses
router.get('/buses', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('buses').select('id,plate_number,bus_code,capacity,status,current_route_id,routes(route_code)').order('bus_code').limit(200);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// PATCH /api/admin/buses/:id  — assign/remove route, change status (staff control)
router.patch('/buses/:id', async (req, res, next) => {
  try {
    const patch = {};
    if ('routeId' in req.body)  patch.current_route_id = req.body.routeId || null; // null = remove from route
    if ('status' in req.body)   patch.status = req.body.status;
    if (!Object.keys(patch).length) return res.status(400).json({ success: false, error: 'Nothing to update' });
    const { data, error } = await supabase.from('buses').update(patch).eq('id', req.params.id)
      .select('id,plate_number,bus_code,status,current_route_id,routes(route_code)').single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/admin/drivers
router.get('/drivers', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('drivers').select('id,full_name,phone,license_number,status,buses(plate_number)').order('full_name').limit(100);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// GET /api/admin/schedules
router.get('/schedules', async (req, res, next) => {
  try {
    const { routeId, limit = 50 } = req.query;
    let query = supabase.from('schedules').select('id,departure_time,arrival_time,is_active,routes(route_code,route_name)').eq('is_active',true).order('departure_time').limit(parseInt(limit));
    if (routeId) query = query.eq('route_id', routeId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// GET /api/admin/trips
router.get('/trips', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('trips').select('id,start_time,end_time,status,delay_minutes,service_date,routes(route_code),buses(plate_number),drivers(full_name)').eq('service_date',today).order('start_time').limit(100);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// GET /api/admin/delays
router.get('/delays', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('trips').select('id,start_time,delay_minutes,status,routes(route_code,route_name),buses(plate_number)').eq('service_date',today).gt('delay_minutes',3).order('delay_minutes',{ascending:false}).limit(50);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// GET /api/admin/incidents
router.get('/incidents', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('incidents').select('id,type,title,description,severity,status,starts_at,routes(route_code)').order('starts_at',{ascending:false}).limit(50);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// POST /api/admin/incidents  — staff reports an incident / notifies passengers.
// Inserting here makes it appear in the passenger app's /api/alerts feed immediately.
router.post('/incidents', async (req, res, next) => {
  try {
    const { type = 'info', title, description, severity = 'warning', routeId = null } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Title is required' });
    const SEV = ['info', 'warning', 'critical'];
    const TYPE = ['delay', 'traffic', 'breakdown', 'info'];
    const sev = SEV.includes(severity) ? severity : 'warning';
    const typ = TYPE.includes(type) ? type : 'info';
    const { data, error } = await supabase.from('incidents').insert({
      type: typ, title: title.trim(), description: (description || '').trim() || null,
      severity: sev, status: 'open', route_id: routeId || null,
      is_active: true, starts_at: new Date().toISOString(),
    }).select('id,type,title,description,severity,status,starts_at,routes(route_code)').single();
    if (error) throw error;
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// PATCH /api/admin/incidents/:id
router.patch('/incidents/:id', async (req, res, next) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabase.from('incidents').update({ status, is_active: status !== 'resolved' }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/admin/adaptive-actions
router.get('/adaptive-actions', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('adaptive_actions').select('id,action_type,reason,severity,status,created_at,routes(route_code)').order('created_at',{ascending:false}).limit(50);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// PATCH /api/admin/adaptive-actions/:id
router.patch('/adaptive-actions/:id', async (req, res, next) => {
  try {
    const { status } = req.body;
    const { data, error } = await supabase.from('adaptive_actions').update({ status }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/admin/reports
router.get('/reports', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [totalRoutes, totalStops, totalTrips, totalBuses, openIncidents, pendingActions] = await Promise.all([
      cnt('routes'), cnt('stops'), cnt('trips','service_date',today), cnt('buses','status','active'),
      cnt('incidents','status','open'), cnt('adaptive_actions','status','pending'),
    ]);
    res.json({ success: true, data: { date: today, totalRoutes, totalStops, totalTrips, totalBuses, openIncidents, pendingActions } });
  } catch (err) { next(err); }
});

// GET /api/admin/feedback  (read-only passenger feedback)
router.get('/feedback', async (req, res, next) => {
  try {
    const { status, type } = req.query;
    let q = supabase.from('passenger_feedback')
      .select('id,type,message,rating,status,created_at,routes(route_code)')
      .order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    if (type) q = q.eq('type', type);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) { next(err); }
});

// GET /api/admin/ussd  (feature-phone USSD request logs)
router.get('/ussd', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('ussd_requests')
      .select('id,session_id,phone_number,text,service_code,response_type,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) { res.json({ success: true, data: [] }); } // table optional — never break
});

// GET /api/admin/ussd/stats
router.get('/ussd/stats', async (req, res, next) => {
  try {
    const { data } = await supabase.from('ussd_requests').select('text,response_type').limit(2000);
    const rows = data || [];
    const total = rows.length;
    const failed = rows.filter(r => String(r.response_type || '').toLowerCase() === 'end' && /invalid|error|not found/i.test(r.text || '')).length;
    const topQueries = Object.entries(rows.reduce((m, r) => { const k = (r.text || '').split('*').pop().trim() || '—'; m[k] = (m[k] || 0) + 1; return m; }, {}))
      .map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    res.json({ success: true, data: { total, failed, topQueries } });
  } catch { res.json({ success: true, data: { total: 0, failed: 0, topQueries: [] } }); }
});

// GET /api/admin/payments — MoMo ledger for app + USSD purchases.
router.get('/payments', async (req, res, next) => {
  try {
    const { status, date, source } = req.query;
    let query = supabase.from('ticket_payments')
      .select('id,reference,payer_phone,amount,currency,route_name,status,source,created_at,urubuto_reference,ticket_id,tickets(ticket_reference,payment_status,validated_at)')
      .order('created_at', { ascending: false }).limit(500);
    if (status) query = query.eq('status', status === 'paid' ? 'success' : status);
    if (source) query = query.eq('source', source);
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86400000);
      query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: (data || []).map(p => ({
      ...p,
      display_status: p.status === 'success' ? 'paid' : p.status,
      ticket_reference: p.tickets?.ticket_reference || null,
      payment_status: p.tickets?.payment_status || (p.status === 'success' ? 'paid' : p.status),
    })) });
  } catch (err) { next(err); }
});

// GET /api/admin/live-map
router.get('/live-map', async (req, res, next) => {
  try {
    const { buildLiveVehicles } = require('./vehicles.routes');
    const vehicles = await buildLiveVehicles();
    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (err) { next(err); }
});

module.exports = router;
