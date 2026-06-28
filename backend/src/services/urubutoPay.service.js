// ============================================================
// UrubutoPay client — real MoMo / mobile-money payments.
//
// Zero new dependencies: uses Node 18+ native fetch (project runs Node 22).
//
// VERIFIED LIVE CONTRACT (staging, merchant TH81842364 / service purchase-3305):
//   1. VALIDATE  POST /payment/validate
//        body { merchant_code, service_code, payer_code }
//        -> data.services[0].service_id, data.payer_names, data.currency
//   2. INITIATE  POST /payment/initiate
//        body { merchant_code, payer_code, service_code, service_id,
//               payment_channel:"WALLET", payment_channel_name:"MOMO",
//               payer_phone_number, paid_mount, payer_names, payer_email }
//        -> data.internal_transaction_ref_number, data.transaction_status:"INITIATED"
//   3. STATUS    POST /payment/transaction/status
//        body { transaction_id: <internal_transaction_ref_number>, merchant_code }
//        -> data.transaction_status: INITIATED | SUCCESSFUL | FAILED | PENDING
//
// Channels: payment_channel = WALLET (mobile money) | CARD;
//           payment_channel_name = MOMO | AIRTEL_MONEY (or NA for card).
// ============================================================
const { URUBUTO } = require('../config/env');

const TIMEOUT_MS = 30000;

function urubutoConfigured() {
  return Boolean(URUBUTO.API_KEY && URUBUTO.MERCHANT_CODE && URUBUTO.SERVICE_CODE);
}

// Mobile-money channel names map to the WALLET payment_channel; card -> CARD.
function resolveChannel(channelName) {
  const name = (channelName || URUBUTO.CHANNEL || 'MOMO').toUpperCase();
  if (name === 'CARD') return { payment_channel: 'CARD', payment_channel_name: 'NA' };
  // MOMO | AIRTEL_MONEY
  return { payment_channel: 'WALLET', payment_channel_name: name };
}

async function callUrubuto(path, { method = 'POST', body } = {}) {
  const url = `${URUBUTO.BASE_URL}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${URUBUTO.API_KEY}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { data = { raw: text }; }
    return { ok: res.ok, httpStatus: res.status, data };
  } catch (err) {
    return { ok: false, httpStatus: 0, data: { message: err.name === 'AbortError' ? 'UrubutoPay request timed out' : err.message } };
  } finally {
    clearTimeout(timer);
  }
}

// The transaction ref UrubutoPay uses for status lookups.
function extractRemoteRef(data = {}) {
  const d = data.data || data;
  return d.internal_transaction_ref_number || d.internal_transaction_id ||
         data.internal_transaction_ref_number || data.internal_transaction_id || null;
}

const SUCCESS = ['SUCCESSFUL', 'SUCCESS', 'COMPLETED', 'VALID', 'PAID'];
const FAILED  = ['FAILED', 'DECLINED', 'CANCELLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'FAILED_PAYMENT'];

function normaliseStatus(data = {}) {
  const d = data.data || data;
  const raw = (d.transaction_status || d.status || d.payment_status || '').toString().toUpperCase();
  if (SUCCESS.includes(raw)) return 'success';
  if (FAILED.includes(raw))  return 'failed';
  return 'pending'; // INITIATED / PENDING / unknown -> keep waiting
}

// Step 1 — resolve service_id (+ payer name) for this payer/merchant/service.
async function validate(payerCode) {
  const { ok, httpStatus, data } = await callUrubuto(URUBUTO.VALIDATE_PATH, {
    method: 'POST',
    body: { merchant_code: URUBUTO.MERCHANT_CODE, service_code: URUBUTO.SERVICE_CODE, payer_code: payerCode },
  });
  if (!ok) {
    return { success: false, message: data?.message || `validate failed (HTTP ${httpStatus})`, raw: data };
  }
  const d = data.data || {};
  const service = (d.services || []).find(s => s.service_code === URUBUTO.SERVICE_CODE) || (d.services || [])[0] || {};
  return {
    success: true,
    serviceId:  service.service_id ?? URUBUTO.SERVICE_ID ?? null,
    payerNames: d.payer_names || 'Customer',
    currency:   d.currency || 'RWF',
    raw: data,
  };
}

/**
 * Push a mobile-money payment request to the payer's phone.
 * @returns {Promise<{success, status, remoteRef, message, raw}>}
 */
async function initiatePayment({ amount, phone, channel }) {
  if (!urubutoConfigured()) {
    return { success: false, status: 'failed', remoteRef: null, message: 'UrubutoPay is not configured (missing API key / merchant / service code).', raw: null };
  }

  // 1) validate -> service_id (+ payer name)
  const v = await validate(phone);
  if (!v.success || !v.serviceId) {
    return { success: false, status: 'failed', remoteRef: null, message: v.message || 'Could not validate the payment (service unavailable).', raw: v.raw };
  }

  const { payment_channel, payment_channel_name } = resolveChannel(channel);

  // 2) initiate
  const body = {
    merchant_code:        URUBUTO.MERCHANT_CODE,
    payer_code:           phone,
    service_code:         URUBUTO.SERVICE_CODE,
    service_id:           Number(v.serviceId),
    payment_channel,
    payment_channel_name,
    payer_phone_number:   phone,
    paid_mount:           Math.round(Number(amount)),   // provider's field spelling
    payer_names:          v.payerNames || 'Customer',
    payer_email:          '',
  };

  const { ok, httpStatus, data } = await callUrubuto(URUBUTO.INITIATE_PATH, { method: 'POST', body });
  const status  = ok ? normaliseStatus(data) : 'failed';
  const message = (data?.data?.transaction_status && `Payment ${data.data.transaction_status.toLowerCase()}`) ||
                  data?.message || (ok ? 'Payment request sent' : `UrubutoPay error (HTTP ${httpStatus})`);

  return {
    success: ok && status !== 'failed',
    status,                         // 'pending' on INITIATED
    remoteRef: extractRemoteRef(data),
    message,
    raw: data,
  };
}

/**
 * Check the status of a transaction by its UrubutoPay reference.
 * @returns {Promise<{success, status, message, raw}>}
 */
async function checkPaymentStatus({ urubutoReference }) {
  if (!urubutoConfigured() || !urubutoReference) {
    return { success: false, status: 'pending', message: 'No UrubutoPay reference yet', raw: null };
  }
  const { ok, httpStatus, data } = await callUrubuto(URUBUTO.STATUS_PATH, {
    method: 'POST',
    body: { transaction_id: urubutoReference, merchant_code: URUBUTO.MERCHANT_CODE },
  });
  return {
    success: ok,
    status: normaliseStatus(data),
    message: data?.message || `HTTP ${httpStatus}`,
    raw: data,
  };
}

module.exports = {
  urubutoConfigured,
  validate,
  initiatePayment,
  checkPaymentStatus,
  normaliseStatus,
  extractRemoteRef,
};
