// ============================================================
// /api/payments — real MoMo payments via UrubutoPay.
//
// ADDITIVE feature. The existing mock "Buy Now" flow in
// tickets.routes.js is untouched. A real `tickets` row is only
// created here once a payment actually SUCCEEDS, so the tickets
// table + its status CHECK constraint are never violated.
//
// Flow:
//   POST /api/payments/initiate     -> create pending payment + push MoMo prompt
//   GET  /api/payments/status/:ref  -> poll; finalises + issues ticket on success
//   POST /api/payments/webhook      -> UrubutoPay callback (same finalise logic)
// ============================================================
const router = require('express').Router();
const { supabase } = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const { initiatePayment, checkPaymentStatus, extractRemoteRef } = require('../services/urubutoPay.service');

// A status request, webhook and the background poller can all observe the same
// successful payment at once. Serialise finalisation per payment so one MoMo
// charge can never issue two tickets in this server process.
const finalisationLocks = new Map();

// Rwandan MoMo number -> 2507XXXXXXXX (12 digits). Accepts 07.., 2507.., +2507..
function normalisePhone(input = '') {
  const digits = String(input).replace(/\D/g, '');
  if (/^07\d{8}$/.test(digits))   return `25${digits}`;   // 07XXXXXXXX -> 2507XXXXXXXX
  if (/^2507\d{8}$/.test(digits)) return digits;          // already full
  if (/^7\d{8}$/.test(digits))    return `250${digits}`;  // 7XXXXXXXX
  return null;
}

// Create the real ticket once a payment has succeeded (mirrors tickets.routes.js).
// Idempotent: if the payment already has a ticket, returns it.
async function issueTicketForPayment(payment) {
  if (payment.ticket_id) {
    const { data: existing } = await supabase.from('tickets').select('*').eq('id', payment.ticket_id).maybeSingle();
    if (existing) return existing;
  }

  // Pull validity/currency from the fare product when available.
  let validityMinutes = 90;
  let currency = payment.currency || 'RWF';
  if (payment.fare_product_id) {
    const { data: product } = await supabase.from('fare_products').select('*').eq('id', payment.fare_product_id).maybeSingle();
    if (product) {
      validityMinutes = product.validity_minutes ?? validityMinutes;
      currency = product.currency || currency;
    }
  }

  const validFrom  = new Date();
  const validUntil = new Date(Date.now() + validityMinutes * 60000);
  const ticketReference = `MOVEXA-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const { data: ticket, error } = await supabase.from('tickets').insert({
    ticket_reference: ticketReference,
    product_name:     payment.product_name || 'Single Trip',
    route_name:       payment.route_name || null,
    price:            payment.amount,
    currency,
    validity_minutes: validityMinutes,
    status:           'active',
    valid_from:       validFrom.toISOString(),
    valid_until:      validUntil.toISOString(),
    activated_at:     validFrom.toISOString(),
    payment_method:   'momo',
    payment_status:   'paid',
    source:           payment.source || 'app',
    qr_payload:       `MOVEXA:TICKET:${ticketReference}:${uuidv4()}`,
  }).select().single();
  if (error) throw error;

  const { error: updateError } = await supabase.from('ticket_payments')
    .update({ ticket_id: ticket.id, status: 'success', updated_at: new Date().toISOString() })
    .eq('id', payment.id);
  if (updateError) throw updateError;

  return ticket;
}

// Shared finaliser used by both polling and the webhook.
async function doFinalisePayment(payment, statusResult) {
  // Re-read inside the lock. Another caller may have settled it while this
  // caller was waiting.
  const { data: current, error: readError } = await supabase
    .from('ticket_payments').select('*').eq('id', payment.id).maybeSingle();
  if (readError) throw readError;
  if (!current) throw new Error('Payment no longer exists');

  if (current.status === 'success') {
    const { data: ticket } = current.ticket_id
      ? await supabase.from('tickets').select('*').eq('id', current.ticket_id).maybeSingle()
      : { data: null };
    return { status: 'success', ticket };
  }
  if (current.status === 'failed' || current.status === 'expired') {
    return { status: current.status, ticket: null };
  }

  const status = statusResult.status; // 'success' | 'failed' | 'pending'

  if (status === 'success') {
    const ticket = await issueTicketForPayment(current);
    return { status: 'success', ticket };
  }

  if (status === 'failed') {
    const { error } = await supabase.from('ticket_payments')
      .update({ status: 'failed', last_status_response: statusResult.raw, updated_at: new Date().toISOString() })
      .eq('id', current.id).eq('status', 'pending');
    if (error) throw error;
    return { status: 'failed', ticket: null };
  }

  // still pending — just record the latest probe
  const { error } = await supabase.from('ticket_payments')
    .update({ last_status_response: statusResult.raw, updated_at: new Date().toISOString() })
    .eq('id', current.id).eq('status', 'pending');
  if (error) throw error;
  return { status: 'pending', ticket: null };
}

async function finalisePayment(payment, statusResult) {
  const key = payment.id || payment.reference;
  while (finalisationLocks.has(key)) await finalisationLocks.get(key);

  let release;
  const lock = new Promise(resolve => { release = resolve; });
  finalisationLocks.set(key, lock);
  try {
    return await doFinalisePayment(payment, statusResult);
  } finally {
    finalisationLocks.delete(key);
    release();
  }
}

// ── POST /api/payments/initiate ──
router.post('/initiate', async (req, res, next) => {
  try {
    const { fareProductId, phone, channel, routeName } = req.body;
    const source = req.body.source === 'ussd' ? 'ussd' : 'app';
    const fareAmount = Number(req.body.fareAmount);

    if (!phone)        return res.status(400).json({ success: false, error: 'phone is required' });
    if (!fareProductId) return res.status(400).json({ success: false, error: 'fareProductId is required' });

    const payerPhone = normalisePhone(phone);
    if (!payerPhone) return res.status(400).json({ success: false, error: 'Enter a valid Rwandan mobile number (07XXXXXXXX).' });

    const { data: product, error: productError } = await supabase.from('fare_products').select('*').eq('id', fareProductId).maybeSingle();
    if (productError) throw productError;
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    // Use client-computed dynamic price when sent, else the product's base price.
    const amount = fareAmount > 0 ? Math.round(fareAmount) : product.price;
    if (!amount || amount < 1) return res.status(400).json({ success: false, error: 'Invalid amount' });

    const reference = `MVX-${uuidv4().toUpperCase()}`;

    // Record the pending payment first so nothing is lost if the network drops.
    const { data: payment, error: insErr } = await supabase.from('ticket_payments').insert({
      reference,
      fare_product_id: fareProductId,
      product_name:    product.name,
      amount,
      currency:        product.currency || 'RWF',
      payer_phone:     payerPhone,
      payment_channel: channel || undefined,
      route_name:      String(routeName || '').trim().slice(0, 160) || null,
      source,
      status:          'pending',
    }).select().single();
    if (insErr) throw insErr;

    // Push the MoMo prompt to the payer's phone.
    const result = await initiatePayment({
      reference,
      amount,
      phone: payerPhone,
      channel,
      description: `MOVEXA ${product.name}`,
    });

    const { error: updateError } = await supabase.from('ticket_payments').update({
      urubuto_reference: result.remoteRef,
      initiate_response: result.raw,
      status: result.status === 'failed' ? 'failed' : 'pending',
      updated_at: new Date().toISOString(),
    }).eq('id', payment.id);
    if (updateError) throw updateError;

    if (!result.success && result.status === 'failed') {
      return res.status(402).json({ success: false, error: result.message, reference });
    }

    res.json({
      success: true,
      data: {
        reference,
        status: 'pending',
        message: result.message || 'Check your phone and approve the MoMo payment.',
        amount,
        currency: product.currency || 'RWF',
        productName: product.name,
        source,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /api/payments/status/:reference ──  (frontend polls this)
router.get('/status/:reference', async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { data: payment, error: paymentError } = await supabase.from('ticket_payments').select('*').eq('reference', reference).maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    // Already settled — return immediately (and the ticket if there is one).
    if (payment.status === 'success') {
      const { data: ticket } = payment.ticket_id
        ? await supabase.from('tickets').select('*').eq('id', payment.ticket_id).maybeSingle()
        : { data: null };
      return res.json({ success: true, data: { status: 'success', reference, ticket } });
    }
    if (payment.status === 'failed' || payment.status === 'expired') {
      return res.json({ success: true, data: { status: payment.status, reference, ticket: null } });
    }

    // Still pending — ask UrubutoPay.
    const statusResult = await checkPaymentStatus({ reference, urubutoReference: payment.urubuto_reference });
    const outcome = await finalisePayment(payment, statusResult);

    res.json({ success: true, data: { status: outcome.status, reference, ticket: outcome.ticket } });
  } catch (err) { next(err); }
});

// ── POST /api/payments/webhook ──  (UrubutoPay callback — primary settlement path)
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const reference = body.reference || body.merchant_reference || body.data?.reference;
    const remoteRef = extractRemoteRef(body) || body.transaction_id || body.data?.transaction_id;
    if (!reference && !remoteRef) return res.status(200).json({ received: true });

    // Providers commonly callback with their own transaction id rather than
    // the merchant reference, so support either identifier.
    let query = supabase.from('ticket_payments').select('*');
    query = reference ? query.eq('reference', reference) : query.eq('urubuto_reference', remoteRef);
    const { data: payment, error: paymentError } = await query.maybeSingle();
    if (paymentError) throw paymentError;
    if (payment && payment.status === 'pending') {
      // capture provider ref if it wasn't known yet
      if (remoteRef && !payment.urubuto_reference) {
        await supabase.from('ticket_payments').update({ urubuto_reference: remoteRef }).eq('id', payment.id);
      }

      // Never trust an unsigned callback body as proof of payment. Confirm the
      // transaction directly with UrubutoPay before issuing a ticket.
      const statusResult = await checkPaymentStatus({
        urubutoReference: payment.urubuto_reference || remoteRef,
      });
      if (statusResult.success) await finalisePayment(payment, statusResult);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    // Always 200 so the gateway doesn't hammer retries; we log for debugging.
    console.error('UrubutoPay webhook error:', err.message);
    res.status(200).json({ received: true });
  }
});

module.exports = router;
module.exports.finalisePayment = finalisePayment;
