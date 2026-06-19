<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Bus, Truck, Clock3, AlertTriangle, Route, MapPin, CalendarClock, Activity, RefreshCw, Sparkles } from 'lucide-vue-next';
import { get } from '../../services/apiClient.js';

const loading = ref(true);
const error = ref('');
const d = ref(null);
const health = ref(null);
let timer;

const kpis = [
  ['activeVehicles', 'Buses on road now', Truck, 'green'],
  ['activeTrips', 'Trips in progress', Bus, 'cyan'],
  ['onTime', 'On-time', Activity, 'green'],
  ['delayedTrips', 'Delayed', Clock3, 'orange'],
  ['scheduledTrips', 'Scheduled trips / day', CalendarClock, 'cyan'],
  ['routes', 'Routes', Route, 'cyan'],
  ['stops', 'Stops', MapPin, 'cyan'],
  ['buses', 'Total fleet', Truck, 'purple'],
];

async function load() {
  error.value = '';
  try {
    const [dash, hp] = await Promise.all([get('/api/admin/dashboard'), get('/api/admin/data-health')]);
    d.value = dash;
    health.value = hp;
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

function fmtTime(t) { return t ? new Date(t).toLocaleString() : '—'; }

onMounted(() => { load(); timer = setInterval(load, 20000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Operations</div>
      <h1>Network Overview</h1>
      <p class="muted">
        Kigali public transport — live system status
        <span v-if="d" class="svc" :class="d.inService ? 'open' : 'closed'">
          {{ d.inService ? '● In service (05:00–22:00)' : '● Service closed — opens 05:00' }}
        </span>
      </p>
    </div>
    <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
  </div>

  <div v-if="error" class="error">{{ error }}</div>
  <div v-if="loading && !d" class="empty">Loading overview…</div>

  <template v-if="d">
    <section class="grid kpi-grid">
      <article v-for="[key, label, Icon, color] in kpis" :key="key" class="card stat">
        <div class="stat-top"><span>{{ label }}</span><component :is="Icon" :color="`var(--admin-${color})`" size="18" /></div>
        <div>
          <div class="stat-value">{{ Number(d[key] || 0).toLocaleString() }}</div>
          <div class="trend">Live · Supabase</div>
        </div>
      </article>
    </section>

    <p class="method-note">
      “Buses on road / Trips in progress” = scheduled trips currently mid-route per the live timetable
      (departure ≤ now ≤ departure + route duration), during service hours — so each running bus is one trip.
      Routes, stops, fleet and scheduled-trips counts are exact database totals. Live positions are simulated
      along real routes pending the on-board GPS feed.
    </p>

    <section class="grid two-col" style="margin-top:16px">
      <div class="card">
        <h2><AlertTriangle size="16" /> Recent Incidents</h2>
        <div class="list">
          <div v-for="i in d.recentIncidents || []" :key="i.id" class="list-item">
            <div>
              <div>{{ i.title || 'Incident' }}</div>
              <div class="muted" style="font-size:12px">{{ fmtTime(i.starts_at) }}</div>
            </div>
            <span class="badge" :class="i.severity">{{ i.status || 'open' }}</span>
          </div>
          <div v-if="!(d.recentIncidents || []).length" class="empty">No incidents reported</div>
        </div>
      </div>

      <div class="card">
        <h2><Sparkles size="16" /> Adaptive Scheduling Actions</h2>
        <div class="list">
          <div v-for="a in d.adaptiveActions || []" :key="a.id" class="list-item">
            <div>
              <div>{{ (a.action_type || '').replace(/_/g, ' ') || 'Action' }}</div>
              <div class="muted" style="font-size:12px">{{ fmtTime(a.created_at) }}</div>
            </div>
            <span class="badge" :class="a.severity">{{ a.status || 'pending' }}</span>
          </div>
          <div v-if="!(d.adaptiveActions || []).length" class="empty">No adaptive actions</div>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <h2><Activity size="16" /> Data Health</h2>
      <div class="grid kpi-grid" style="margin-top:8px">
        <div v-for="(v, k) in (health || {})" :key="k" class="metric-tile">
          <div class="metric-label">{{ String(k).replace(/_/g, ' ') }}</div>
          <div class="metric-number">{{ Number(v).toLocaleString() }}</div>
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
.svc { font-size: 12px; font-weight: 700; margin-left: 10px; padding: 3px 10px; border-radius: 20px; }
.svc.open { color: #0a7d56; background: rgba(14,165,113,.12); }
.svc.closed { color: var(--admin-muted); background: var(--admin-surface-3); }
.method-note { font-size: 12px; color: var(--admin-muted); line-height: 1.55; margin-top: 14px; padding: 10px 14px; background: var(--admin-surface-2); border: 1px dashed var(--admin-border); border-radius: 10px; }
</style>
