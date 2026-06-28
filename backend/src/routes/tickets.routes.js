const router = require('express').Router();
const { supabase } = require('../config/supabase');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET || 'movexa-staff-dev-secret';

function requireStaff(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Staff authentication required' });
  try {
    req.staff = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired staff token' });
  }
}

const REALISTIC_PRODUCTS = [
  { name: 'Single Trip',      description: 'One-way ticket — price based on your journey distance (59.48 RWF/km)', price: 0,     currency: 'RWF', validity_minutes: 90,    is_active: true, badge: null },
  { name: '7-Day Unlimited',  description: 'Unlimited rides for 7 days — save up to 30% vs single trips',          price: 16000, currency: 'RWF', validity_minutes: 10080,  is_active: true, badge: 'Best Value' },
  { name: '1-Month Unlimited', description: 'Unlimited rides for 30 days — commuter favourite, ~40% saving',       price: 52000, currency: 'RWF', validity_minutes: 43200, is_active: true, badge: 'Commuter' },
];

// GET /api/tickets/products
router.get('/products', async (req, res, next) => {
  try {
    let { data, error } = await supabase.from('fare_products').select('*').eq('is_active', true).order('price');
    if (error) throw error;
    // Replace if products are missing or don't include realistic prices (Day Pass >= 3500)
    if (!data?.length || !data.some(p => p.name === '7-Day Unlimited') || !data.some(p => p.name === 'Single Trip')) {
      await supabase.from('fare_products').delete().gte('price', 0);
      // Strip runtime-only fields before inserting
      const toInsert = REALISTIC_PRODUCTS.map(({ badge, ...rest }) => rest);
      const { data: inserted, error: ie } = await supabase.from('fare_products').insert(toInsert).select();
      if (ie) console.error('fare_products insert error:', ie.message);
      data = inserted || [];
    }
    res.json({ success: true, data: (data || []).map(p => ({ ...p, badge: REALISTIC_PRODUCTS.find(r => r.name === p.name)?.badge || null })) });
  } catch (err) { next(err); }
});

// Direct/mock purchase is retired: all passenger tickets must settle through MoMo.
router.post('/purchase', (req, res) => {
  res.status(410).json({ success: false, error: 'Direct ticket purchase is disabled. Use MoMo payment.' });
});

// GET /api/tickets/my  (no auth required for demo — returns last 10 tickets)
router.get('/my', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    res.json({ success: true, data: data || [] });
  } catch (err) { next(err); }
});

// POST /api/tickets/validate — QR payload or feature-phone ticket reference.
// A valid ticket is atomically marked used so it cannot be presented twice.
router.post('/validate', requireStaff, async (req, res, next) => {
  try {
    const value = String(req.body?.value || req.body?.qrPayload || req.body?.reference || '').trim();
    if (!value) return res.status(400).json({ success: false, result: 'invalid', error: 'Ticket QR or reference is required' });

    let query = supabase.from('tickets').select('*');
    query = value.startsWith('MOVEXA:TICKET:') ? query.eq('qr_payload', value) : query.eq('ticket_reference', value.toUpperCase());
    const { data: ticket, error } = await query.maybeSingle();
    if (error) throw error;
    if (!ticket || ticket.payment_method !== 'momo' || ticket.payment_status !== 'paid') {
      return res.status(404).json({ success: false, result: 'invalid', error: 'Invalid or unpaid ticket' });
    }

    const publicTicket = (t) => ({
      ticketReference: t.ticket_reference || t.id,
      route: t.route_name || t.product_name,
      amount: t.price,
      currency: t.currency,
      paymentStatus: t.payment_status,
      source: t.source,
      validUntil: t.valid_until,
      validatedAt: t.validated_at,
      status: t.status,
    });

    if (ticket.status === 'used' || ticket.validated_at) {
      return res.status(409).json({ success: false, result: 'already_used', data: publicTicket(ticket) });
    }
    if (ticket.status === 'expired' || (ticket.valid_until && new Date(ticket.valid_until) <= new Date())) {
      if (ticket.status !== 'expired') await supabase.from('tickets').update({ status: 'expired' }).eq('id', ticket.id);
      return res.status(410).json({ success: false, result: 'expired', data: publicTicket({ ...ticket, status: 'expired' }) });
    }

    const now = new Date().toISOString();
    const { data: validated, error: updateError } = await supabase.from('tickets')
      .update({ status: 'used', validated_at: now, validated_by: req.staff.username || req.staff.name || 'staff' })
      .eq('id', ticket.id).eq('status', 'active').is('validated_at', null).select().maybeSingle();
    if (updateError) throw updateError;
    if (!validated) return res.status(409).json({ success: false, result: 'already_used', data: publicTicket(ticket) });

    res.json({ success: true, result: 'valid', data: publicTicket(validated) });
  } catch (err) { next(err); }
});

module.exports = router;
