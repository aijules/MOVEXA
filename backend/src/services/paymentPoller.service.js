// ============================================================
// Background settlement for UrubutoPay payments.
//
// Mirrors the provided node-cron spec, but adapted to MOVEXA's
// Supabase stack with zero new dependencies (plain setInterval):
//   • every POLL_SECONDS  — poll pending payments, finalise on success/failure
//   • every 5 minutes     — expire stale pending payments
//
// This is a safety net behind the webhook + the frontend poller —
// it guarantees a payment eventually settles even if the user closes
// the app and no callback arrives. Disable with PAYMENT_POLL_ENABLED=false.
// ============================================================
const { supabase } = require('../config/supabase');
const { URUBUTO } = require('../config/env');
const { checkPaymentStatus, urubutoConfigured } = require('./urubutoPay.service');
const { finalisePayment } = require('../routes/payments.routes');

let pollTimer = null;
let expiryTimer = null;

async function pollPendingPayments() {
  try {
    const { data: pending, error } = await supabase
      .from('ticket_payments').select('*').eq('status', 'pending').limit(50);
    if (error) throw error;
    if (!pending?.length) return;

    for (const payment of pending) {
      try {
        const statusResult = await checkPaymentStatus({
          reference: payment.reference,
          urubutoReference: payment.urubuto_reference,
        });
        if (!statusResult.success) continue;
        if (statusResult.status === 'pending') continue;

        const outcome = await finalisePayment(payment, statusResult);
        if (outcome.status === 'success') {
          console.log(`✓ Payment ${payment.reference} settled — ticket issued.`);
        } else if (outcome.status === 'failed') {
          console.log(`✗ Payment ${payment.reference} marked FAILED by UrubutoPay.`);
        }
      } catch (e) {
        console.error('Error polling payment', payment.reference, e.message);
      }
    }
  } catch (error) {
    console.error('Error polling pending payments:', error.message);
  }
}

async function expireStalePayments() {
  try {
    const cutoff = new Date(Date.now() - URUBUTO.PENDING_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const { data: stale, error } = await supabase
      .from('ticket_payments').select('*')
      .eq('status', 'pending').lt('created_at', cutoff);
    if (error) throw error;
    if (!stale?.length) return;

    for (const p of stale) {
      try {
        // One last provider check avoids expiring a payment that completed at
        // the same moment as the cleanup job.
        const statusResult = await checkPaymentStatus({
          urubutoReference: p.urubuto_reference,
        });
        if (statusResult.success && statusResult.status !== 'pending') {
          await finalisePayment(p, statusResult);
          continue;
        }

        const { error: updateError } = await supabase.from('ticket_payments')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', p.id).eq('status', 'pending');
        if (updateError) throw updateError;
        console.log(`Payment ${p.reference} auto-expired (pending > ${URUBUTO.PENDING_EXPIRY_MINUTES}m).`);
      } catch (e) {
        console.error('Error expiring payment', p.reference, e.message);
      }
    }
  } catch (error) {
    console.error('Error expiring stale payments:', error.message);
  }
}

function startPaymentPoller() {
  if (!URUBUTO.POLL_ENABLED) {
    console.log('  Payments: background poller disabled (PAYMENT_POLL_ENABLED=false).');
    return;
  }
  if (!urubutoConfigured()) {
    console.log('  Payments: UrubutoPay not configured — poller idle until URUBUTO_* env is set.');
    return;
  }
  if (pollTimer) return; // already running

  pollTimer   = setInterval(pollPendingPayments, URUBUTO.POLL_SECONDS * 1000);
  expiryTimer = setInterval(expireStalePayments, 5 * 60 * 1000);
  // Probe once on startup instead of waiting 15 seconds to expose a missing
  // migration or settle a payment left pending during a restart.
  pollPendingPayments();
  expireStalePayments();
  console.log(`  Payments: UrubutoPay poller active (every ${URUBUTO.POLL_SECONDS}s, expiry ${URUBUTO.PENDING_EXPIRY_MINUTES}m).`);
}

module.exports = { startPaymentPoller, pollPendingPayments, expireStalePayments };
