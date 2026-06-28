<script setup>
import { onMounted, onUnmounted, ref, nextTick } from 'vue';
import { Phone, RefreshCw, CornerDownLeft, RotateCcw } from 'lucide-vue-next';
import { api, get } from '../../services/apiClient.js';

const logs = ref([]);
const error = ref('');
let timer;

// ── USSD simulator state ──
const sessionId = ref('');
const phone = ref('+250788123456');
const text = ref('');           // accumulated input (Africa's Talking style)
const screen = ref('');         // current response text
const ended = ref(true);
const input = ref('');
const screenEl = ref(null);

function newSession() { return 'sim-' + Math.random().toString(36).slice(2, 9); }

async function send(value) {
  // value is the user's reply for this step (or '' to start)
  const next = text.value === '' ? (value || '') : (value === '' ? text.value : `${text.value}*${value}`);
  try {
    const body = await api('/api/ussd', { method: 'POST', body: JSON.stringify({
      sessionId: sessionId.value, phoneNumber: phone.value, serviceCode: '*384*6065#', text: next,
    }) });
    text.value = next;
    screen.value = String(body);
    ended.value = String(body).startsWith('END');
    input.value = '';
    load();
  } catch (e) { screen.value = 'END ' + e.message; ended.value = true; }
}

function dial() {
  sessionId.value = newSession();
  text.value = '';
  ended.value = false;
  send('');
}
function reply() { if (!ended.value && input.value.trim()) send(input.value.trim()); }
function reset() { sessionId.value = ''; text.value = ''; screen.value = ''; ended.value = true; input.value = ''; }

async function load() {
  try { logs.value = await get('/api/admin/ussd'); error.value = ''; }
  catch (e) { error.value = e.message; }
}
function fmt(t) { return t ? new Date(t).toLocaleTimeString() : '—'; }

onMounted(() => { load(); timer = setInterval(load, 8000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Feature phones</div>
      <h1>USSD Service</h1>
      <p class="muted">Live USSD gateway for passengers without smartphones — test it and watch requests log</p>
    </div>
    <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
  </div>

  <section class="grid ussd-grid">
    <!-- Simulator -->
    <div class="card phone-card">
      <h2><Phone size="16" /> USSD Simulator</h2>
      <div class="phone">
        <div class="phone-screen" ref="screenEl">
          <div v-if="!screen" class="phone-hint">Dial <b>*384*6065#</b> to start a session.</div>
          <pre v-else class="phone-text">{{ screen.replace(/^CON |^END /, '') }}</pre>
          <div v-if="ended && screen" class="phone-end">— session ended —</div>
        </div>
        <div class="phone-input" v-if="!ended">
          <input v-model="input" class="input" placeholder="Type reply (e.g. 1)" @keyup.enter="reply" />
          <button class="btn primary sm" @click="reply"><CornerDownLeft size="15" /></button>
        </div>
        <div class="phone-actions">
          <button class="btn primary block" v-if="ended" @click="dial">📞 Dial *384*6065#</button>
          <button class="btn sm" @click="reset"><RotateCcw size="14" /> Reset</button>
        </div>
      </div>
    </div>

    <!-- Live logs -->
    <div class="card table-panel">
      <div class="panel-head">
        <div><h2 style="margin-bottom:4px">Live Request Log</h2><div class="muted">Every USSD interaction, newest first.</div></div>
        <span class="badge scheduled">{{ logs.length }} logged</span>
      </div>
      <div v-if="error" class="error">{{ error }}</div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Time</th><th>Phone</th><th>Input</th><th>Type</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in logs" :key="i">
              <td>{{ fmt(l.created_at) }}</td>
              <td>{{ l.phone_number || '—' }}</td>
              <td><code>{{ l.text || '(start)' }}</code></td>
              <td><span class="badge" :class="l.response_type === 'END' ? 'open' : 'scheduled'">{{ l.response_type }}</span></td>
            </tr>
            <tr v-if="!logs.length"><td colspan="4" class="muted" style="padding:16px">No USSD requests yet — try the simulator.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ussd-grid { grid-template-columns: 340px minmax(0, 1fr); align-items: start; }
.phone { display: flex; flex-direction: column; gap: 12px; }
.phone-screen { background: #0f1d17; color: #d6ffe9; border-radius: 14px; padding: 16px; min-height: 200px; font-family: 'Courier New', monospace; border: 1px solid rgba(14,165,113,.3); box-shadow: inset 0 2px 10px rgba(0,0,0,.4); }
.phone-text { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; }
.phone-hint { color: #8fb8a4; font-size: 13px; }
.phone-end { color: #ff9aa6; font-size: 12px; margin-top: 12px; }
.phone-input { display: flex; gap: 8px; }
.phone-actions { display: flex; gap: 8px; align-items: center; }
.btn.sm { min-height: 34px; padding: 0 12px; font-size: 12px; }
.block { flex: 1; justify-content: center; }
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 10px 12px; color: var(--admin-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--admin-border); }
.data-table td { padding: 10px 12px; border-bottom: 1px solid var(--admin-border); }
@media (max-width: 1000px) { .ussd-grid { grid-template-columns: 1fr; } }
</style>
