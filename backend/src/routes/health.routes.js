const router = require('express').Router();
const { supabase } = require('../config/supabase');

async function cnt(table, col, val) {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (col) q = q.eq(col, val);
  const { count } = await q;
  return count || 0;
}

router.get('/', async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [routes, stops, routeStops, routePaths, schedules, trips, buses, activeVehicles] = await Promise.all([
      cnt('routes'),
      cnt('stops'),
      cnt('route_stops'),
      cnt('route_paths'),
      cnt('schedules'),
      cnt('trips', 'service_date', today),
      cnt('buses', 'status', 'active'),
      cnt('bus_locations'),
    ]);

    res.json({
      success: true,
      data: {
        status:        'ok',
        database:      'supabase',
        server_time:   new Date().toISOString(),
        counts: { routes, stops, route_stops: routeStops, route_paths: routePaths, schedules, trips, buses, active_vehicles: activeVehicles },
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
