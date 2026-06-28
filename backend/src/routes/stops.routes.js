const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { haversineMeters } = require('../utils/geo');

// GET /api/stops?q=kimironko&limit=20
router.get('/', async (req, res, next) => {
  try {
    const { q, limit = 20, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from('stops')
      .select('id,stop_code,stop_name,latitude,longitude,area', { count: 'exact' })
      .eq('is_active', true)
      .order('stop_name')
      .range(offset, offset + parseInt(limit) - 1);

    if (q) query = query.ilike('stop_name', `%${q}%`);

    const { data, count, error } = await query;
    if (error) throw error;
    res.json({ success: true, data: data || [], meta: { total: count, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

// GET /api/stops/search?q=sonatubes
router.get('/search', async (req, res, next) => {
  try {
    const { q = '', limit = 10 } = req.query;
    if (!q) return res.json({ success: true, data: [] });

    const { data, error } = await supabase
      .from('stops')
      .select('id,stop_code,stop_name,latitude,longitude')
      .eq('is_active', true)
      .ilike('stop_name', `%${q}%`)
      .order('stop_name')
      .limit(parseInt(limit));
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) { next(err); }
});

// GET /api/stops/nearby?lat=&lng=&radius=1000
router.get('/nearby', async (req, res, next) => {
  try {
    const { lat, lng, radius = 1000, limit = 10 } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, error: 'lat and lng required' });

    const latN = parseFloat(lat);
    const lngN = parseFloat(lng);

    // Bounding box filter first (1° ≈ 111 km)
    const deg = parseFloat(radius) / 111000;
    const { data, error } = await supabase
      .from('stops')
      .select('id,stop_code,stop_name,latitude,longitude,area')
      .eq('is_active', true)
      .gte('latitude', latN - deg)
      .lte('latitude', latN + deg)
      .gte('longitude', lngN - deg)
      .lte('longitude', lngN + deg)
      .limit(50);
    if (error) throw error;

    const withDist = (data || [])
      .map(s => ({ ...s, distance_meters: Math.round(haversineMeters(latN, lngN, Number(s.latitude), Number(s.longitude))) }))
      .filter(s => s.distance_meters <= parseFloat(radius))
      .sort((a, b) => a.distance_meters - b.distance_meters)
      .slice(0, parseInt(limit));

    res.json({ success: true, data: withDist });
  } catch (err) { next(err); }
});

// GET /api/stops/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('stops')
      .select('*')
      .or(`id.eq.${req.params.id},stop_code.eq.${req.params.id}`)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Stop not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/stops/:id/departures
router.get('/:id/departures', async (req, res, next) => {
  try {
    const { time = '00:00', limit = 20 } = req.query;
    const { data: stop } = await supabase.from('stops').select('id').eq('id', req.params.id).maybeSingle();
    if (!stop) return res.status(404).json({ success: false, error: 'Stop not found' });

    const { data: routeStops } = await supabase
      .from('route_stops')
      .select('route_id,stop_order,estimated_minutes_from_start')
      .eq('stop_id', stop.id);

    const routeIds = (routeStops || []).map(rs => rs.route_id);
    if (!routeIds.length) return res.json({ success: true, data: [] });

    const { data: schedules } = await supabase
      .from('schedules')
      .select('id,route_id,departure_time,arrival_time,routes(route_code,route_name,color)')
      .in('route_id', routeIds)
      .gte('departure_time', time)
      .eq('is_active', true)
      .order('departure_time')
      .limit(parseInt(limit));

    res.json({ success: true, data: schedules || [] });
  } catch (err) { next(err); }
});

module.exports = router;
