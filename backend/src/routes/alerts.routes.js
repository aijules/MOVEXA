const router = require('express').Router();
const { supabase } = require('../config/supabase');

router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select('id,type,title,description,severity,status,starts_at,ends_at,routes(route_code,route_name)')
      .eq('is_active', true)
      .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
      .order('starts_at', { ascending: false })
      .limit(20);
    if (error) throw error;

    const alerts = (data || []).map(a => ({
      _id:      a.id,
      id:       a.id,
      title:    a.title,
      message:  a.description,
      severity: a.severity,
      type:     a.type,
      status:   a.status,
      routeCode: a.routes?.route_code,
      routeName: a.routes?.route_name,
      startsAt:  a.starts_at,
      endsAt:    a.ends_at,
      isActive:  true,
    }));

    res.json({ success: true, data: alerts });
  } catch (err) { next(err); }
});

module.exports = router;
