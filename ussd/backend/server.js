/**
 * ─────────────────────────────────────────────────────────────────────────
 * MOVEXA USSD Backend  —  dedicated, independent service on :6000
 * ─────────────────────────────────────────────────────────────────────────
 * Zero npm dependencies: built-in `http` + native `fetch` to Supabase REST.
 *
 * Reuses the EXISTING MOVEXA Supabase database (routes, stops, route_stops,
 * schedules, incidents, trips) read-only, and writes to its OWN additive
 * tables: ussd_sessions (+ reuses ussd_requests for logging, passenger
 * feedback to ussd_feedback). It never modifies existing MOVEXA logic.
 *
 * Africa's Talking compatible:  POST /ussd  (and /api/ussd)
 *   body { sessionId, phoneNumber, serviceCode, text } -> text/plain CON|END
 *
 * Management endpoints (consumed by the USSD dashboard on :6002):
 *   GET  /api/health
 *   GET  /api/config
 *   GET  /api/analytics
 *   GET  /api/sessions
 *   GET  /api/logs
 *   GET  /api/feedback
 *   POST /api/feedback   { sessionId, phoneNumber, message, rating, routeCode? }
 */
const http = require('http');
const { loadEnv } = require('./lib/env');
loadEnv();

const { handleUssd } = require('./lib/menu');
const { buildAnalytics } = require('./lib/analytics');
const { select, insert, upsert, update, ilikeValue } = require('./lib/sb');

const PORT = parseInt(process.env.USSD_PORT, 10) || 6000;
const SERVICE_CODES = (process.env.USSD_SERVICE_CODES || '*384*45343#,*384*MOVEXA#').split(',').map(s => s.trim());

/* ── helpers ─────────────────────────────────────────── */
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJson(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}
function sendText(res, code, text) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'text/plain' });
  res.end(text);
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch {
        // also accept x-www-form-urlencoded (Africa's Talking default)
        const out = {};
        for (const pair of data.split('&')) {
          const [k, v] = pair.split('=');
          if (k) out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
        }
        resolve(out);
      }
    });
  });
}

/* ── session + log persistence (best-effort, never breaks USSD) ── */
async function logRequest({ sessionId, phoneNumber, serviceCode, text, responseType }) {
  try {
    // Dedicated ussd_logs table (created by ussd/db/schema.sql) — keeps the USSD
    // module independent and leaves the pre-existing ussd_requests table untouched.
    await insert('ussd_logs', {
      session_id: sessionId || null,
      phone_number: phoneNumber || null,
      service_code: serviceCode || SERVICE_CODES[0],
      text: text || '',
      response_type: responseType,
    });
  } catch { /* ussd_logs optional until schema.sql applied */ }
}

async function trackSession({ sessionId, phoneNumber, serviceCode, type, isError }) {
  if (!sessionId) return;
  const nowIso = new Date().toISOString();
  const status = isError ? 'failed' : type === 'END' ? 'completed' : 'active';
  try {
    // Try upsert (needs UNIQUE(session_id)); fall back silently if table absent.
    const existing = await select(`ussd_sessions?session_id=eq.${encodeURIComponent(sessionId)}&select=id,step_count`).catch(() => []);
    if (existing.length) {
      await update('ussd_sessions', `session_id=eq.${encodeURIComponent(sessionId)}`, {
        status, last_activity: nowIso, step_count: (existing[0].step_count || 0) + 1,
        ended_at: type === 'END' ? nowIso : null,
      });
    } else {
      await insert('ussd_sessions', {
        session_id: sessionId, phone_number: phoneNumber || null, service_code: serviceCode || SERVICE_CODES[0],
        status, step_count: 1, started_at: nowIso, last_activity: nowIso,
        ended_at: type === 'END' ? nowIso : null,
      });
    }
  } catch { /* ussd_sessions optional until schema.sql applied */ }
}

/** Pull this caller's recent ETA/Journey searches for the Saved Journeys menu. */
async function recentSearchesFor(phoneNumber) {
  if (!phoneNumber) return [];
  try {
    const rows = await select(
      `ussd_logs?phone_number=eq.${encodeURIComponent(phoneNumber)}&select=text,created_at&order=created_at.desc&limit=60`
    );
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const p = String(r.text || '').split('*').filter(Boolean);
      if ((p[0] === '1' || p[0] === '2') && p[1] && p[2] && p[1] !== '0' && p[2] !== '0') {
        const key = `${p[1]}|${p[2]}`.toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push({ from: p[1], to: p[2] }); }
        if (out.length >= 4) break;
      }
    }
    return out;
  } catch { return []; }
}

/* ── route handlers ──────────────────────────────────── */
async function handleUssdRequest(req, res) {
  const body = await readBody(req);
  const { sessionId, phoneNumber, serviceCode, text = '' } = body;
  let result, isError = false;
  try {
    const recentSearches = String(text).startsWith('6') ? await recentSearchesFor(phoneNumber) : [];
    result = await handleUssd({ text, phoneNumber, recentSearches });
  } catch (e) {
    isError = true;
    result = { response: 'END Service temporarily\nunavailable. Try again.', type: 'END' };
  }
  // Persist (await so the dashboard reflects activity immediately).
  await Promise.all([
    logRequest({ sessionId, phoneNumber, serviceCode, text, responseType: result.type }),
    trackSession({ sessionId, phoneNumber, serviceCode, type: result.type, isError }),
  ]);
  sendText(res, 200, result.response);
}

async function handleAnalytics(req, res) {
  try { sendJson(res, 200, { success: true, data: await buildAnalytics() }); }
  catch (e) { sendJson(res, 200, { success: true, data: {}, error: e.message }); }
}

async function handleSessions(req, res) {
  try {
    let sessions = await select(
      'ussd_sessions?select=session_id,phone_number,service_code,status,step_count,started_at,ended_at,last_activity&order=last_activity.desc&limit=80'
    ).catch(() => []);
    // Fallback: reconstruct sessions from the request log if the table is empty.
    if (!sessions.length) {
      const reqs = await select('ussd_logs?select=session_id,phone_number,text,response_type,created_at&order=created_at.desc&limit=600').catch(() => []);
      const map = {};
      for (const r of reqs) {
        const sid = r.session_id || 'unknown';
        if (!map[sid]) map[sid] = { session_id: sid, phone_number: r.phone_number, status: 'active', step_count: 0, last_activity: r.created_at, started_at: r.created_at, steps: [] };
        map[sid].step_count++;
        map[sid].steps.push({ text: r.text, type: r.response_type, at: r.created_at });
        if (r.response_type === 'END') map[sid].status = 'completed';
      }
      sessions = Object.values(map).slice(0, 80);
    }
    sendJson(res, 200, { success: true, data: sessions });
  } catch (e) { sendJson(res, 200, { success: true, data: [], error: e.message }); }
}

async function handleLogs(req, res) {
  try {
    const rows = await select('ussd_logs?select=session_id,phone_number,service_code,text,response_type,created_at&order=created_at.desc&limit=200').catch(() => []);
    sendJson(res, 200, { success: true, data: rows });
  } catch (e) { sendJson(res, 200, { success: true, data: [], error: e.message }); }
}

async function handleGetFeedback(req, res) {
  try {
    const rows = await select('ussd_feedback?select=id,session_id,phone_number,route_code,message,rating,created_at&order=created_at.desc&limit=100').catch(() => []);
    sendJson(res, 200, { success: true, data: rows });
  } catch (e) { sendJson(res, 200, { success: true, data: [], error: e.message }); }
}

async function handlePostFeedback(req, res) {
  const body = await readBody(req);
  const { sessionId, phoneNumber, message, rating, routeCode } = body;
  if (!message || !String(message).trim()) return sendJson(res, 400, { success: false, error: 'message required' });
  try {
    const row = await insert('ussd_feedback', {
      session_id: sessionId || null, phone_number: phoneNumber || null,
      route_code: routeCode || null, message: String(message).trim(),
      rating: rating != null ? Number(rating) : null,
    });
    sendJson(res, 201, { success: true, data: row[0] || row });
  } catch (e) { sendJson(res, 200, { success: false, error: 'Run ussd/db/schema.sql to enable feedback: ' + e.message }); }
}

/* ── server ──────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (req.method === 'POST' && (path === '/ussd' || path === '/api/ussd')) return await handleUssdRequest(req, res);
    if (req.method === 'GET' && path === '/api/health') return sendJson(res, 200, { success: true, service: 'movexa-ussd-backend', port: PORT, codes: SERVICE_CODES });
    if (req.method === 'GET' && path === '/api/config') return sendJson(res, 200, { success: true, data: { serviceCodes: SERVICE_CODES } });
    if (req.method === 'GET' && path === '/api/analytics') return await handleAnalytics(req, res);
    if (req.method === 'GET' && path === '/api/sessions') return await handleSessions(req, res);
    if (req.method === 'GET' && path === '/api/logs') return await handleLogs(req, res);
    if (req.method === 'GET' && path === '/api/feedback') return await handleGetFeedback(req, res);
    if (req.method === 'POST' && path === '/api/feedback') return await handlePostFeedback(req, res);
    if (req.method === 'GET' && path === '/') return sendJson(res, 200, { success: true, service: 'MOVEXA USSD Backend', endpoints: ['/ussd', '/api/analytics', '/api/sessions', '/api/logs', '/api/feedback'] });
    sendJson(res, 404, { success: false, error: 'Not found' });
  } catch (e) {
    sendJson(res, 500, { success: false, error: e.message });
  }
});

if (!process.env.SUPABASE_URL) {
  console.warn('⚠  SUPABASE_URL not found. Ensure ussd/.env or backend/.env has Supabase credentials.');
}
server.listen(PORT, () => {
  console.log(`✓ MOVEXA USSD Backend on http://localhost:${PORT}`);
  console.log(`  Service codes: ${SERVICE_CODES.join('  ')}`);
  console.log(`  Supabase: ${process.env.SUPABASE_URL ? 'connected' : 'NOT CONFIGURED'}`);
});
