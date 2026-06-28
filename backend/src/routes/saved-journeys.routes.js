const router = require('express').Router();
const { supabase } = require('../config/supabase');

// GET /api/saved-journeys
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('saved_journeys').select('*').order('created_at',{ascending:false}).limit(20);
    if (error) throw error;
    res.json({ success: true, data: data||[] });
  } catch (err) { next(err); }
});

// POST /api/saved-journeys
router.post('/', async (req, res, next) => {
  try {
    const { fromStopId, toStopId, fromStopName, toStopName, routeId, journeyData } = req.body;
    const { data, error } = await supabase.from('saved_journeys').insert({
      from_stop_id:   fromStopId || null,
      to_stop_id:     toStopId || null,
      from_stop_name: fromStopName,
      to_stop_name:   toStopName,
      route_id:       routeId || null,
      journey_data:   journeyData || {},
    }).select().single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// DELETE /api/saved-journeys/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase.from('saved_journeys').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
