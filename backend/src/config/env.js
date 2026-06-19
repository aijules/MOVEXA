require('dotenv').config();

const defaultCorsOrigins = [
  'https://movexa-nu.vercel.app',
  'https://movexa-41tyhj74r-movexa-app.vercel.app',
];
const configuredCorsOrigins = (process.env.CORS_ORIGIN || process.env.CLIENT_URLS || process.env.CLIENT_URL || '')
  .split(',').map(value => value.trim()).filter(Boolean);
const clientUrls = [...new Set([...defaultCorsOrigins, ...configuredCorsOrigins])];

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 5000,
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/movexa',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  CLIENT_URLS: clientUrls,
  CORS_ORIGINS: clientUrls,
  JWT_SECRET: process.env.JWT_SECRET || 'movexa-dev-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // ── UrubutoPay (real MoMo / mobile-money payments) ──
  // Discovered live contract: base = https://staging.urubutopay.rw/api,
  // initiate = POST {BASE}/payment/initiate, channels = MOMO|AIRTEL_MONEY|VISA,
  // statuses = INITIATED|SUCCESSFUL|FAILED|PENDING.
  URUBUTO: {
    BASE_URL:      process.env.URUBUTO_BASE_URL      || 'https://staging.urubutopay.rw/api',
    API_KEY:       process.env.URUBUTO_API_KEY       || '',
    MERCHANT_CODE: process.env.URUBUTO_MERCHANT_CODE || '',
    SERVICE_CODE:  process.env.URUBUTO_SERVICE_CODE  || '',
    // Mobile-money channel name: MOMO | AIRTEL_MONEY (mapped to payment_channel WALLET).
    CHANNEL:       process.env.URUBUTO_PAYMENT_CHANNEL || 'MOMO',
    // service_id is normally resolved live via /payment/validate; this is a fallback.
    SERVICE_ID:    process.env.URUBUTO_SERVICE_ID ? Number(process.env.URUBUTO_SERVICE_ID) : null,
    // Provider paths (override only if your merchant docs differ).
    VALIDATE_PATH: process.env.URUBUTO_VALIDATE_PATH || '/payment/validate',
    INITIATE_PATH: process.env.URUBUTO_INITIATE_PATH || '/payment/initiate',
    STATUS_PATH:   process.env.URUBUTO_STATUS_PATH   || '/payment/transaction/status',
    // Where UrubutoPay POSTs the final result (optional but recommended).
    CALLBACK_URL:  process.env.URUBUTO_CALLBACK_URL  || '',
    // Pending payments older than this are auto-expired (matches the cron spec).
    PENDING_EXPIRY_MINUTES: Number(process.env.PAYMENT_PENDING_EXPIRY_MINUTES || 15),
    // Background poller (no node-cron dep — plain setInterval). Set to 'false' to disable.
    POLL_ENABLED:  process.env.PAYMENT_POLL_ENABLED !== 'false',
    POLL_SECONDS:  Number(process.env.PAYMENT_POLL_SECONDS || 15),
  },
};
