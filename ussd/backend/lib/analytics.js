/**
 * USSD service analytics — derived from ussd_requests (request log) and
 * ussd_sessions (session tracking). Both are tolerant of a missing table so
 * the service keeps working before schema.sql has been applied.
 */
const { select } = require('./sb');

const KIGALI_OFFSET_HOURS = 2; // Africa/Kigali = UTC+2 (no DST)

async function safeSelect(query) {
  try { return await select(query); } catch { return []; }
}

function menuLabel(opt) {
  return { '1': 'Check Bus ETA', '2': 'Journey Planner', '3': 'Service Alerts', '4': 'Fare Information', '5': 'Nearby Stops', '6': 'Saved Journeys', '7': 'About' }[opt] || 'Other';
}

async function buildAnalytics() {
  const reqs = await safeSelect(
    'ussd_logs?select=session_id,phone_number,text,response_type,created_at&order=created_at.desc&limit=3000'
  );
  const sessions = await safeSelect(
    'ussd_sessions?select=session_id,phone_number,status,step_count,started_at,ended_at,last_activity&order=last_activity.desc&limit=2000'
  );

  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;

  // ── Session counts ──
  let activeSessions = 0, completedSessions = 0, failedSessions = 0;
  for (const s of sessions) {
    const last = new Date(s.last_activity || s.started_at).getTime();
    if (s.status === 'completed') completedSessions++;
    else if (s.status === 'failed') failedSessions++;
    else if (s.status === 'active' && last >= fiveMinAgo) activeSessions++;
  }
  // Fallback when ussd_sessions is empty: derive from the request log.
  if (!sessions.length && reqs.length) {
    const map = {};
    for (const r of reqs) {
      const sid = r.session_id || 'x';
      if (!map[sid]) map[sid] = { last: r.created_at, ended: false };
      if (r.response_type === 'END') map[sid].ended = true;
    }
    for (const v of Object.values(map)) {
      if (v.ended) completedSessions++;
      else if (new Date(v.last).getTime() >= fiveMinAgo) activeSessions++;
    }
  }

  // ── Request-level metrics ──
  const totalRequests = reqs.length;
  const failedRequests = reqs.filter(r =>
    r.response_type === 'END' && /not found|invalid|unavailable|no bus|no route/i.test(r.text || '')
  ).length;

  // ── Popular routes (options 1 & 4 carry a route code or stop) ──
  const routeCounts = {};
  const stopCounts = {};
  const menuCounts = {};
  const hourly = Array(24).fill(0);

  for (const r of reqs) {
    const p = String(r.text || '').split('*').filter(Boolean);
    if (p[0]) menuCounts[p[0]] = (menuCounts[p[0]] || 0) + 1;

    // Route codes from Fare (4*code)
    if (p[0] === '4' && p[1]) {
      const k = p[1].toUpperCase();
      routeCounts[k] = (routeCounts[k] || 0) + 1;
    }
    // Stops/areas from ETA (1*from*to), Journey (2*from*to), Nearby (5*area)
    if ((p[0] === '1' || p[0] === '2') && p[1]) stopCounts[p[1]] = (stopCounts[p[1]] || 0) + 1;
    if ((p[0] === '1' || p[0] === '2') && p[2]) stopCounts[p[2]] = (stopCounts[p[2]] || 0) + 1;
    if (p[0] === '5' && p[1]) stopCounts[p[1]] = (stopCounts[p[1]] || 0) + 1;

    if (r.created_at) {
      const h = (new Date(r.created_at).getUTCHours() + KIGALI_OFFSET_HOURS) % 24;
      hourly[h]++;
    }
  }

  const popularRoutes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code, count]) => ({ code, count }));
  const popularStops = Object.entries(stopCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([stop, count]) => ({ stop, count }));
  const menuUsage = Object.entries(menuCounts).sort((a, b) => b[1] - a[1]).map(([opt, count]) => ({ option: opt, label: menuLabel(opt), count }));

  // Peak hour
  const peakHour = hourly.reduce((best, c, h) => (c > hourly[best] ? h : best), 0);

  const totalSessions = completedSessions + failedSessions + activeSessions;
  const completionRate = totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const uniqueCallers = new Set(reqs.map(r => r.phone_number).filter(Boolean)).size;

  return {
    totalRequests,
    activeSessions,
    completedSessions,
    failedRequests,
    failedSessions,
    uniqueCallers,
    completionRate,
    peakHour,
    popularRoutes,
    popularStops,
    menuUsage,
    hourly,
  };
}

module.exports = { buildAnalytics };
