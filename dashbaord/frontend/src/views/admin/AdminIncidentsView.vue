<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Megaphone, Check, RefreshCw, AlertTriangle, Send } from 'lucide-vue-next';
import { get, post, patch } from '../../services/apiClient.js';

const incidents = ref([]);
const routes = ref([]);
const error = ref('');
const toast = ref('');
const sending = ref(false);
let timer;

const form = ref({ type: 'delay', severity: 'warning', routeId: '', title: '', description: '' });
const types = [['delay', 'Delay'], ['traffic', 'Traffic'], ['breakdown', 'Breakdown'], ['info', 'Announcement']];
const severities = [['info', 'Info'], ['warning', 'Warning'], ['critical', 'Critical']];

async function load() {
  error.value = '';
  try {
    const [inc, rts] = await Promise.all([get('/api/admin/incidents'), get('/api/admin/routes').catch(() => [])]);
    incidents.value = inc || [];
    routes.value = rts || [];
  } catch (e) { error.value = e.message; }
}

async function notify() {
  if (!form.value.title.trim()) { error.value = 'Title is required'; return; }
  sending.value = true; error.value = '';
  try {
    await post('/api/admin/incidents', { ...form.value, routeId: form.value.routeId || null });
    toast.value = 'Passengers notified — alert is now live in the passenger app.';
    form.value = { type: 'delay', severity: 'warning', routeId: '', title: '', description: '' };
    await load();
    setTimeout(() => (toast.value = ''), 4000);
  } catch (e) { error.value = e.message; }
  finally { sending.value = false; }
}

async function resolve(id) {
  try { await patch(`/api/admin/incidents/${id}`, { status: 'resolved' }); await load(); }
  catch (e) { error.value = e.message; }
}

function fmt(t) { return t ? new Date(t).toLocaleString() : '—'; }

onMounted(() => { load(); timer = setInterval(load, 15000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Operations</div>
      <h1>Incidents &amp; Passenger Notifications</h1>
      <p class="muted">Report a disruption and instantly notify passengers in the app</p>
    </div>
    <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
  </div>

  <transition name="toast"><div v-if="toast" class="toast-bar"><Check size="16" /> {{ toast }}</div></transition>
  <div v-if="error" class="error">{{ error }}</div>

  <section class="grid two-col">
    <!-- Composer -->
    <div class="card composer reveal">
      <h2><Megaphone size="16" /> Notify Passengers</h2>
      <div class="form-grid">
        <label>Type
          <select v-model="form.type" class="select">
            <option v-for="[v, l] in types" :key="v" :value="v">{{ l }}</option>
          </select>
        </label>
        <label>Severity
          <select v-model="form.severity" class="select">
            <option v-for="[v, l] in severities" :key="v" :value="v">{{ l }}</option>
          </select>
        </label>
      </div>
      <label class="block">Affected route (optional)
        <select v-model="form.routeId" class="select">
          <option value="">All routes / network-wide</option>
          <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.route_code }} — {{ r.route_name }}</option>
        </select>
      </label>
      <label class="block">Title
        <input v-model="form.title" class="input" placeholder="e.g. Heavy traffic on Route 104R" />
      </label>
      <label class="block">Message to passengers
        <textarea v-model="form.description" class="input area" rows="3" placeholder="Explain the delay cause and expected impact…"></textarea>
      </label>
      <button class="btn primary block notify-btn" :disabled="sending" @click="notify">
        <Send size="16" /> {{ sending ? 'Notifying…' : 'Notify Passengers' }}
      </button>
      <p class="hint"><AlertTriangle size="13" /> This appears live in the passenger app’s alerts.</p>
    </div>

    <!-- Active list -->
    <div class="card">
      <h2>Active Incidents <span class="count-pill">{{ incidents.length }}</span></h2>
      <div class="inc-list">
        <transition-group name="list">
          <div v-for="i in incidents" :key="i.id" class="inc-row" :class="`sev-${i.severity}`">
            <div class="inc-main">
              <div class="inc-title">{{ i.title }}</div>
              <div class="inc-desc muted">{{ i.description || '—' }}</div>
              <div class="inc-meta">
                <span class="badge" :class="i.severity">{{ i.severity }}</span>
                <span class="muted">{{ i.routes?.route_code || 'Network-wide' }}</span>
                <span class="muted">{{ fmt(i.starts_at) }}</span>
              </div>
            </div>
            <button class="btn resolve" @click="resolve(i.id)" title="Resolve & clear from passenger app"><Check size="15" /> Resolve</button>
          </div>
        </transition-group>
        <div v-if="!incidents.length" class="empty">No active incidents.</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
label { display: block; font-size: 12px; color: var(--admin-muted); font-weight: 600; margin-bottom: 10px; }
label.block { display: block; }
.select, .input { margin-top: 6px; }
.area { padding: 10px 12px; resize: vertical; min-height: 70px; }
.notify-btn { width: 100%; justify-content: center; margin-top: 6px; }
.hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--admin-muted); margin-top: 10px; }
.toast-bar { display: flex; align-items: center; gap: 8px; background: rgba(20,199,132,.14); border: 1px solid rgba(20,199,132,.35); color: var(--admin-green); padding: 11px 14px; border-radius: 10px; margin-bottom: 14px; font-weight: 600; }
.count-pill { font-size: 12px; background: rgba(255,77,79,.16); color: #ff8d8e; border-radius: 20px; padding: 2px 9px; margin-left: 6px; }
.inc-list { display: flex; flex-direction: column; gap: 10px; }
.inc-row { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; background: var(--admin-surface-2); border: 1px solid var(--admin-border); border-left: 3px solid var(--admin-muted); border-radius: 10px; padding: 12px 14px; }
.inc-row.sev-warning { border-left-color: var(--admin-yellow); }
.inc-row.sev-critical { border-left-color: var(--admin-red); }
.inc-row.sev-info { border-left-color: var(--admin-cyan); }
.inc-title { font-weight: 700; font-size: 14px; }
.inc-desc { font-size: 12px; margin: 3px 0 7px; }
.inc-meta { display: flex; gap: 10px; align-items: center; font-size: 12px; flex-wrap: wrap; }
.btn.resolve { flex-shrink: 0; color: var(--admin-green); border-color: rgba(20,199,132,.3); }
.btn.resolve:hover { background: rgba(20,199,132,.12); }
</style>
