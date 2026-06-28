/**
 * USSD service for feature-phone passengers (Africa's Talking compatible).
 * Receives { sessionId, phoneNumber, serviceCode, text } and returns a plain-text
 * body starting with "CON " (more input) or "END " (final). Every request is
 * logged to ussd_requests so the staff dashboard can monitor activity.
 */
const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { HHMMtoMinutes } = require('../utils/time');

function nowHHMM() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

async function logRequest({ sessionId, phoneNumber, serviceCode, text, responseType }) {
  try {
    await supabase.from('ussd_requests').insert({
      session_id: sessionId || null,
      phone_number: phoneNumber || null,
      service_code: serviceCode || '*384*MOVEXA#',
      text: text || '',
      response_type: responseType,
    });
  } catch { /* logging is best-effort */ }
}

async function nextBusesForRoute(code) {
  // Exact route-code match first, then a partial fallback.
  let { data: routes } = await supabase.from('routes')
    .select('id,route_code,route_name').ilike('route_code', code).limit(1);
  if (!routes?.length) {
    ({ data: routes } = await supabase.from('routes')
      .select('id,route_code,route_name').ilike('route_code', `%${code}%`).order('route_code').limit(1));
  }
  const route = routes?.[0];
  if (!route) return null;
  const now = nowHHMM();
  const { data: scheds } = await supabase.from('schedules')
    .select('departure_time').eq('route_id', route.id).eq('is_active', true)
    .gte('departure_time', now).order('departure_time').limit(3);
  return { route, times: (scheds || []).map(s => s.departure_time.slice(0, 5)) };
}

// POST /api/ussd
router.post('/', async (req, res) => {
  const { sessionId, phoneNumber, serviceCode, text = '' } = req.body || {};
  const parts = String(text).split('*').filter(s => s !== '');
  let response = '';
  let type = 'CON';

  try {
    if (parts.length === 0) {
      response = 'CON Welcome to MOVEXA\n1. Next bus times\n2. Service alerts\n3. About';
    } else if (parts[0] === '1' && parts.length === 1) {
      response = 'CON Enter route code (e.g. 104R):';
    } else if (parts[0] === '1' && parts.length === 2) {
      const r = await nextBusesForRoute(parts[1]);
      type = 'END';
      response = !r ? `END Route "${parts[1]}" not found.`
        : r.times.length ? `END ${r.route.route_code} ${r.route.route_name}\nNext buses: ${r.times.join(', ')}`
        : `END ${r.route.route_code}: no more buses today.`;
    } else if (parts[0] === '2') {
      const { data: inc } = await supabase.from('incidents')
        .select('title').eq('is_active', true).order('starts_at', { ascending: false }).limit(3);
      type = 'END';
      response = (inc && inc.length) ? `END Service alerts:\n- ${inc.map(i => i.title).join('\n- ')}` : 'END No active service alerts.';
    } else if (parts[0] === '3') {
      type = 'END';
      response = 'END MOVEXA — smart transport for Kigali. Dial anytime for live bus times.';
    } else {
      type = 'END';
      response = 'END Invalid option.';
    }
  } catch {
    type = 'END';
    response = 'END Service temporarily unavailable.';
  }

  //await logRequest({ sessionId, phoneNumber, serviceCode, text, responseType: type });
  res.set('Content-Type', 'text/plain').send(response);
});

module.exports = router;
