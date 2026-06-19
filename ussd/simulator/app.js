/* ──────────────────────────────────────────────────────────────────────────
   MOVEXA USSD Simulator — front-end logic (vanilla, no build step)
   Talks to the dedicated USSD backend on :6000.
   ────────────────────────────────────────────────────────────────────────── */
// Same-origin: the simulator's own server (:6001) proxies /ussd and /api/* to
// the USSD backend (:6000). Empty base = relative URLs → no CORS, tunnel-safe.
const BACKEND = '';
const SERVICE_CODES_DEFAULT = ['*384*45343#', '*384*MOVEXA#'];
const TIMEOUT_SECS = 30;

const $ = (id) => document.getElementById(id);
const state = {
  phase: 'idle',          // idle | typing | connecting | session | ended
  dial: '',
  acc: '',                // accumulated USSD text
  sessionId: '',
  serviceCode: SERVICE_CODES_DEFAULT[0],
  delay: 650,
  speed: 1,
  rating: 0,
  timer: null,
  timeLeft: TIMEOUT_SECS,
  demoAbort: false,
};

/* ── clocks ── */
function tickClock() {
  const t = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  $('idleClock').textContent = t;
  $('statusClock').textContent = t;
}
setInterval(tickClock, 1000); tickClock();

/* ── screen rendering ── */
function show(phase) {
  state.phase = phase;
  $('screenIdle').classList.toggle('hidden', phase !== 'idle' && phase !== 'typing');
  $('screenConnecting').classList.toggle('hidden', phase !== 'connecting');
  $('screenPopup').classList.toggle('hidden', phase !== 'session' && phase !== 'ended');
  $('backKey').disabled = phase !== 'session';
  if (phase === 'idle' || phase === 'typing') {
    $('idleDial').textContent = state.dial;
    $('idleHint').textContent = state.dial ? 'Press 📞 to dial' : 'Dial a USSD code to begin';
  }
}

function renderPopup(text, ended) {
  $('popupCode').textContent = state.dial || state.serviceCode;
  $('popupBody').textContent = String(text).replace(/^CON |^END /, '');
  $('popupEnded').classList.toggle('hidden', !ended);
  $('popupInputRow').classList.toggle('hidden', ended);
  show(ended ? 'ended' : 'session');
  if (!ended) { $('replyInput').value = ''; $('replyInput').focus(); }
}

/* ── timeout ── */
function startTimeout() {
  clearInterval(state.timer);
  state.timeLeft = TIMEOUT_SECS;
  updateTimer();
  state.timer = setInterval(() => {
    state.timeLeft--;
    updateTimer();
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      finishSession('timeout', 'END Session timed out.\nDial *384*45343# to retry.');
    }
  }, 1000);
}
function updateTimer() {
  const el = $('popupTimer');
  el.textContent = state.timeLeft + 's';
  el.classList.toggle('urgent', state.timeLeft <= 10);
}
function stopTimeout() { clearInterval(state.timer); }

/* ── backend call ── */
async function callBackend(text) {
  const res = await fetch(`${BACKEND}/ussd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: state.sessionId,
      phoneNumber: $('phoneNumber').value.trim(),
      serviceCode: state.dial || state.serviceCode,
      text,
    }),
  });
  return res.text();
}

/* ── session flow ── */
function newSessionId() { return 'sim-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

async function dial() {
  const code = state.dial || state.serviceCode;
  if (!code) return;
  state.dial = code;
  state.sessionId = newSessionId();
  state.acc = '';
  show('connecting');
  await wait(state.delay);
  await step('');
}

async function step(value) {
  // build next accumulated text (Africa's Talking convention)
  const next = state.acc === '' ? (value || '') : (value === '' ? state.acc : `${state.acc}*${value}`);
  show('connecting');
  await wait(state.delay);
  let body;
  try { body = await callBackend(next); }
  catch (e) { return finishSession('failed', 'END Network error.\nIs the USSD backend\nrunning on :6000?'); }
  state.acc = next;
  const ended = body.startsWith('END');
  if (ended) { finishSession(/not found|invalid|unavailable|no bus|no route|timed out/i.test(body) ? 'failed' : 'completed', body); }
  else { renderPopup(body, false); startTimeout(); }
}

function finishSession(status, body) {
  stopTimeout();
  renderPopup(body, true);
  saveHistory(status, body);
}

async function sendReply() {
  const v = $('replyInput').value.trim();
  if (!v) return;
  stopTimeout();
  await step(v);
}

function endCall() {
  stopTimeout();
  if (state.phase === 'session') saveHistory('timeout', state.lastBody || 'END Cancelled by user.');
  resetPhone();
}

function resetPhone() {
  stopTimeout();
  state.dial = ''; state.acc = ''; state.sessionId = '';
  show('idle');
}

/* ── keypad ── */
function pressKey(k) {
  flash(k);
  if (state.phase === 'ended') { resetPhone(); return; }
  if (state.phase === 'idle' || state.phase === 'typing') {
    if (k === '#' && state.dial.includes('*')) return void dial();
    state.dial += k;
    show('typing');
  } else if (state.phase === 'session') {
    const inp = $('replyInput');
    if (k === '#') return void sendReply();
    inp.value += k;
  }
}
function flash(k) {
  const btn = document.querySelector(`.dialpad button[data-k="${CSS.escape(k)}"]`);
  if (btn) { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 140); }
}

/* ── session history (localStorage) ── */
const HKEY = 'movexa_ussd_history';
function saveHistory(status, body) {
  const hist = loadHistory();
  hist.unshift({
    code: state.dial || state.serviceCode,
    phone: $('phoneNumber').value.trim(),
    acc: state.acc,
    status,
    last: String(body).replace(/^END /, '').split('\n')[0].slice(0, 40),
    at: Date.now(),
  });
  localStorage.setItem(HKEY, JSON.stringify(hist.slice(0, 25)));
  renderHistory();
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch { return []; }
}
function renderHistory() {
  const hist = loadHistory();
  const el = $('historyList');
  if (!hist.length) { el.innerHTML = '<div class="hist-empty">No sessions yet — dial to start.</div>'; return; }
  el.innerHTML = hist.map((h, i) => `
    <div class="hist-item" data-i="${i}">
      <div class="hist-top">
        <span class="hist-code">${h.code}</span>
        <span class="hist-badge ${h.status}">${h.status}</span>
      </div>
      <div class="hist-meta">${h.last || '—'} · ${new Date(h.at).toLocaleTimeString()}</div>
    </div>`).join('');
  el.querySelectorAll('.hist-item').forEach(node => {
    node.onclick = () => replayHistory(hist[+node.dataset.i]);
  });
}
function replayHistory(h) {
  // Re-dial the same code and path automatically.
  resetPhone();
  state.dial = h.code;
  const inputs = (h.acc || '').split('*').filter(Boolean);
  runSequence([{ type: 'call' }, ...inputs.map(v => ({ type: 'reply', value: v }))]);
}

/* ── demo / presentation mode ── */
const SCENARIOS = [
  { code: '*384*45343#', steps: ['1', 'Kacyiru', 'CBD'] },
  { code: '*384*45343#', steps: ['2', 'Nyabugogo', 'Remera'] },
  { code: '*384*45343#', steps: ['3'] },
  { code: '*384*45343#', steps: ['4', '104'] },
];
async function runDemo() {
  const sc = SCENARIOS[+$('demoScenario').value] || SCENARIOS[0];
  resetPhone();
  state.demoAbort = false;
  state.dial = '';
  show('typing');
  await typeString(sc.code);
  await runSequence([{ type: 'call' }, ...sc.steps.map(v => ({ type: 'reply', value: v }))]);
}
async function runSequence(seq) {
  for (const s of seq) {
    if (state.demoAbort) return;
    if (s.type === 'call') { await dial(); await wait(500 / state.speed); }
    else if (s.type === 'reply') {
      if (state.phase !== 'session') break;
      const inp = $('replyInput'); inp.value = '';
      for (const ch of String(s.value)) {
        if (state.demoAbort) return;
        inp.value += ch; await wait(110 / state.speed);
      }
      await wait(300 / state.speed);
      await sendReply();
      await wait(400 / state.speed);
    }
  }
}
async function typeString(str) {
  state.dial = '';
  for (const ch of str) {
    if (state.demoAbort) return;
    state.dial += ch; show('typing'); await wait(120 / state.speed);
  }
}
function stopDemo() { state.demoAbort = true; resetPhone(); }

/* ── feedback ── */
async function sendFeedback() {
  const message = $('fbMessage').value.trim();
  if (!message) { $('fbStatus').textContent = 'Please write a message first.'; return; }
  try {
    const res = await fetch(`${BACKEND}/api/feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId || newSessionId(), phoneNumber: $('phoneNumber').value.trim(), message, rating: state.rating || null }),
    });
    const data = await res.json();
    $('fbStatus').textContent = data.success ? '✓ Thank you for your feedback!' : (data.error || 'Could not send.');
    if (data.success) { $('fbMessage').value = ''; setRating(0); }
  } catch { $('fbStatus').textContent = 'Network error — is the backend on :6000?'; }
}
function setRating(v) {
  state.rating = v;
  $('stars').querySelectorAll('span').forEach(s => s.classList.toggle('on', +s.dataset.v <= v));
}

/* ── backend health ── */
async function checkHealth() {
  try {
    const r = await fetch(`${BACKEND}/api/health`); const d = await r.json();
    $('backendPill').classList.remove('down');
    if (d.codes) { renderCodeChips(d.codes); }
  } catch { $('backendPill').classList.add('down'); }
}

/* ── service-code chips ── */
function renderCodeChips(codes) {
  const el = $('codeChips');
  el.innerHTML = codes.map(c => `<button class="chip${c === state.serviceCode ? ' active' : ''}" data-code="${c}">${c}</button>`).join('');
  el.querySelectorAll('.chip').forEach(c => c.onclick = () => {
    state.serviceCode = c.dataset.code;
    el.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === c));
    $('dialQuickCode').textContent = state.serviceCode;
  });
}

/* ── utils ── */
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ── wiring ── */
function init() {
  renderCodeChips(SERVICE_CODES_DEFAULT);
  renderHistory();

  $('dialpad').querySelectorAll('button').forEach(b => b.onclick = () => pressKey(b.dataset.k));
  $('callBtn').onclick = () => (state.phase === 'session' ? sendReply() : dial());
  $('clearBtn').onclick = () => {
    if (state.phase === 'session') { const i = $('replyInput'); i.value = i.value.slice(0, -1); }
    else { state.dial = state.dial.slice(0, -1); show('typing'); }
  };
  $('endBtn').onclick = endCall;
  $('cancelKey').onclick = endCall;
  $('backKey').onclick = () => { if (state.phase === 'session') { stopTimeout(); step('0'); } };
  $('sendBtn').onclick = sendReply;
  $('replyInput').addEventListener('keyup', e => { if (e.key === 'Enter') sendReply(); });

  $('dialQuick').onclick = () => { resetPhone(); state.dial = state.serviceCode; dial(); };
  $('addCodeBtn').onclick = () => {
    const c = $('customCode').value.trim();
    if (c) { state.serviceCode = c; $('dialQuickCode').textContent = c;
      renderCodeChips([...new Set([...SERVICE_CODES_DEFAULT, c])]); $('customCode').value = ''; }
  };

  $('delayChips').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    state.delay = +c.dataset.delay;
    $('delayChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === c));
  });
  $('speedChips').querySelectorAll('.chip').forEach(c => c.onclick = () => {
    state.speed = +c.dataset.speed;
    $('speedChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === c));
  });

  $('demoBtn').onclick = runDemo;
  $('demoStopBtn').onclick = stopDemo;
  $('clearHistBtn').onclick = () => { localStorage.removeItem(HKEY); renderHistory(); };

  $('stars').querySelectorAll('span').forEach(s => s.onclick = () => setRating(+s.dataset.v));
  $('fbSend').onclick = sendFeedback;

  // physical keyboard support
  document.addEventListener('keydown', e => {
    if (document.activeElement === $('replyInput') || document.activeElement === $('fbMessage')
        || document.activeElement === $('phoneNumber') || document.activeElement === $('customCode')) return;
    if (/^[0-9*#]$/.test(e.key)) pressKey(e.key);
    else if (e.key === 'Enter') (state.phase === 'session' ? sendReply() : dial());
    else if (e.key === 'Backspace') $('clearBtn').click();
  });

  show('idle');
  checkHealth();
  setInterval(checkHealth, 15000);
}
document.addEventListener('DOMContentLoaded', init);
