/* ──────────────────────────────────────────────────────────────────────────
   MOVEXA USSD Management Dashboard — front-end logic (vanilla, no build step)
   Reads metrics from the dedicated USSD backend on :6000.
   ────────────────────────────────────────────────────────────────────────── */
// Same-origin: the dashboard's own server (:6002) proxies /api/* to the USSD
// backend (:6000). Empty base = relative URLs → no CORS, tunnel-safe.
const BACKEND = '';
const $ = (id) => document.getElementById(id);

async function api(path) {
  const r = await fetch(`${BACKEND}${path}`);
  const j = await r.json();
  return j.data !== undefined ? j.data : j;
}

/* ── KPI cards ── */
function renderKpis(a) {
  const cards = [
    ['Total Requests', a.totalRequests ?? 0, 'Logged interactions (24h)', 'var(--teal)'],
    ['Active Sessions', a.activeSessions ?? 0, 'Live in last 5 min', 'var(--blue)'],
    ['Completed Sessions', a.completedSessions ?? 0, 'Reached an END screen', 'var(--green)'],
    ['Failed Requests', a.failedRequests ?? 0, 'Errors / not-found', 'var(--red)'],
    ['Unique Callers', a.uniqueCallers ?? 0, 'Distinct phone numbers', 'var(--purple)'],
    ['Completion Rate', (a.completionRate ?? 0) + '%', 'Sessions reaching END', 'var(--green)'],
    ['Peak Hour', (a.peakHour != null ? String(a.peakHour).padStart(2, '0') + ':00' : '—'), 'Busiest time of day', 'var(--orange)'],
  ];
  $('kpis').innerHTML = cards.map(([label, val, sub, color]) => `
    <div class="kpi">
      <div class="kpi-top"><span>${label}</span><span class="kpi-dot" style="background:${color}"></span></div>
      <div class="kpi-val">${val}</div>
      <div class="kpi-sub">${sub}</div>
    </div>`).join('');
}

/* ── peak hours chart ── */
function renderHours(hourly = []) {
  const max = Math.max(...hourly, 1);
  $('hoursChart').innerHTML = hourly.map((c, h) => `
    <div class="hbar-wrap" title="${String(h).padStart(2,'0')}:00 — ${c} requests">
      <div class="hbar" style="height:${Math.max(2, Math.round((c / max) * 100))}%"></div>
      ${h % 4 === 0 ? `<span class="hlabel">${String(h).padStart(2, '0')}</span>` : ''}
    </div>`).join('');
}

/* ── menu usage bars ── */
function renderMenu(menuUsage = []) {
  if (!menuUsage.length) { $('menuBars').innerHTML = '<div class="empty">No menu usage yet.</div>'; return; }
  const max = Math.max(...menuUsage.map(m => m.count), 1);
  $('menuBars').innerHTML = menuUsage.map(m => `
    <div class="bar-row">
      <span class="bar-label">${m.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, Math.round((m.count / max) * 100))}%"></div></div>
      <span class="bar-val">${m.count}</span>
    </div>`).join('');
}

/* ── popular routes/stops ── */
function renderRoutes(rows = []) {
  $('routesTbl').innerHTML = rows.length
    ? rows.map(r => `<tr><td><code>${r.code}</code></td><td>${r.count}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">No route queries yet</td></tr>';
}
function renderStops(rows = []) {
  $('stopsTbl').innerHTML = rows.length
    ? rows.map(r => `<tr><td>${escapeHtml(r.stop)}</td><td>${r.count}</td></tr>`).join('')
    : '<tr><td colspan="2" class="empty">No stop searches yet</td></tr>';
}

/* ── sessions ── */
function renderSessions(rows = []) {
  $('sessCount').textContent = `${rows.length} shown`;
  $('sessTbl').innerHTML = rows.length
    ? rows.map(s => `
      <tr>
        <td><code>${(s.session_id || '').slice(0, 16)}</code></td>
        <td>${s.phone_number || '—'}</td>
        <td>${s.service_code || '—'}</td>
        <td>${s.step_count ?? '—'}</td>
        <td><span class="badge ${s.status || 'active'}">${s.status || 'active'}</span></td>
        <td>${fmt(s.last_activity || s.started_at)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="empty">No sessions yet</td></tr>';
}

/* ── logs ── */
function renderLogs(rows = []) {
  $('logsTbl').innerHTML = rows.length
    ? rows.slice(0, 40).map(l => `
      <tr>
        <td>${fmtTime(l.created_at)}</td>
        <td>${l.phone_number || '—'}</td>
        <td><code>${escapeHtml(l.text || '(start)')}</code></td>
        <td><span class="badge ${l.response_type || 'CON'}">${l.response_type || '—'}</span></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">No requests logged yet</td></tr>';
}

/* ── feedback ── */
function renderFeedback(rows = []) {
  $('feedbackList').innerHTML = rows.length
    ? rows.map(f => `
      <div class="fb-item">
        <div class="fb-top">
          <span class="fb-stars">${'★'.repeat(f.rating || 0)}${'☆'.repeat(5 - (f.rating || 0))}</span>
          <span class="fb-meta">${f.phone_number || 'anon'}</span>
        </div>
        <div class="fb-msg">${escapeHtml(f.message || '')}</div>
        <div class="fb-meta">${fmt(f.created_at)}</div>
      </div>`).join('')
    : '<div class="empty">No feedback yet — submit one from the Simulator.</div>';
}

/* ── utils ── */
function fmt(t) { return t ? new Date(t).toLocaleString() : '—'; }
function fmtTime(t) { return t ? new Date(t).toLocaleTimeString() : '—'; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ── load everything ── */
async function loadAll() {
  try {
    await fetch(`${BACKEND}/api/health`);
    $('backendPill').classList.remove('down');
  } catch { $('backendPill').classList.add('down'); }

  try {
    const [analytics, sessions, logs, feedback] = await Promise.all([
      api('/api/analytics').catch(() => ({})),
      api('/api/sessions').catch(() => []),
      api('/api/logs').catch(() => []),
      api('/api/feedback').catch(() => []),
    ]);
    renderKpis(analytics);
    renderHours(analytics.hourly || []);
    renderMenu(analytics.menuUsage || []);
    renderRoutes(analytics.popularRoutes || []);
    renderStops(analytics.popularStops || []);
    renderSessions(sessions || []);
    renderLogs(logs || []);
    renderFeedback(feedback || []);
    $('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    $('updated').textContent = 'Error: ' + e.message;
  }
}

$('refreshBtn').onclick = loadAll;
loadAll();
setInterval(loadAll, 8000);
