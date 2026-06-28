const router = require('express').Router();
const { supabase } = require('../config/supabase');

// GET /api/routes
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('id,route_code,route_name,origin_name,destination_name,color,text_color,status,total_distance_km,estimated_duration_minutes')
      .eq('status', 'active')
      .order('route_code');
    if (error) throw error;
    res.json({ success: true, count: data.length, data });
  } catch (err) { next(err); }
});

// GET /api/routes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .or(`id.eq.${req.params.id},route_code.eq.${req.params.id}`)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, error: 'Route not found' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /api/routes/:id/stops
router.get('/:id/stops', async (req, res, next) => {
  try {
    // Resolve route id
    const { data: route } = await supabase
      .from('routes')
      .select('id')
      .or(`id.eq.${req.params.id},route_code.eq.${req.params.id}`)
      .maybeSingle();
    if (!route) return res.status(404).json({ success: false, error: 'Route not found' });

    const { data, error } = await supabase
      .from('route_stops')
      .select('stop_order,distance_from_start_km,estimated_minutes_from_start,stops(id,stop_code,stop_name,latitude,longitude)')
      .eq('route_id', route.id)
      .order('stop_order');
    if (error) throw error;

    const stops = (data || []).map(rs => ({
      stop_order: rs.stop_order,
      distance_from_start_km: rs.distance_from_start_km,
      estimated_minutes_from_start: rs.estimated_minutes_from_start,
      ...rs.stops,
    }));

    res.json({ success: true, count: stops.length, data: stops });
  } catch (err) { next(err); }
});

// GET /api/routes/:id/path
router.get('/:id/path', async (req, res, next) => {
  try {
    const { data: route } = await supabase
      .from('routes')
      .select('id')
      .or(`id.eq.${req.params.id},route_code.eq.${req.params.id}`)
      .maybeSingle();
    if (!route) return res.status(404).json({ success: false, error: 'Route not found' });

    const { data, error } = await supabase
      .from('route_paths')
      .select('coordinates,distance_km,path_order')
      .eq('route_id', route.id)
      .order('path_order')
      .maybeSingle();
    if (error) throw error;

    res.json({ success: true, data: data || { coordinates: [], distance_km: 0 } });
  } catch (err) { next(err); }
});

// GET /api/routes/:id/timetable
router.get('/:id/timetable', async (req, res, next) => {
  try {
    const { data: route } = await supabase
      .from('routes')
      .select('id')
      .or(`id.eq.${req.params.id},route_code.eq.${req.params.id}`)
      .maybeSingle();
    if (!route) return res.status(404).json({ success: false, error: 'Route not found' });

    const { data, error } = await supabase
      .from('schedules')
      .select('id,departure_time,arrival_time,service_days')
      .eq('route_id', route.id)
      .eq('is_active', true)
      .order('departure_time')
      .limit(100);
    if (error) throw error;
    res.json({ success: true, count: (data || []).length, data: data || [] });
  } catch (err) { next(err); }
});

// GET /api/routes/:id/live-vehicles
router.get('/:id/live-vehicles', async (req, res, next) => {
  try {
    const { data: route } = await supabase
      .from('routes')
      .select('id')
      .or(`id.eq.${req.params.id},route_code.eq.${req.params.id}`)
      .maybeSingle();
    if (!route) return res.status(404).json({ success: false, error: 'Route not found' });

    const today = new Date().toISOString().split('T')[0];
    const { data: trips } = await supabase
      .from('trips')
      .select('id,bus_id,start_time')
      .eq('route_id', route.id)
      .eq('status', 'active')
      .eq('service_date', today);

    const busIds = (trips || []).map(t => t.bus_id).filter(Boolean);
    if (!busIds.length) return res.json({ success: true, count: 0, data: [] });

    const { data: locations } = await supabase
      .from('bus_locations')
      .select('bus_id,latitude,longitude,speed_kph,heading,progress_percentage,recorded_at')
      .in('bus_id', busIds);

    res.json({ success: true, count: (locations || []).length, data: locations || [] });
  } catch (err) { next(err); }
});

module.exports = router;
