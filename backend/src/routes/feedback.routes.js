const router = require('express').Router();
const { supabase } = require('../config/supabase');

// POST /api/feedback
router.post('/', async (req, res, next) => {
  try {
    const { type = 'general', message, rating, routeId } = req.body;
    if (!message || message.trim().length < 3) return res.status(400).json({ success: false, error: 'Message too short' });
    const { data, error } = await supabase.from('passenger_feedback').insert({ type, message: message.trim(), rating: rating||null, route_id: routeId||null, status:'new' }).select().single();
    if (error) throw error;
    res.status(201).json({ success: true, data: { id: data.id, message: 'Thank you for your feedback!' } });
  } catch (err) { next(err); }
});

module.exports = router;
