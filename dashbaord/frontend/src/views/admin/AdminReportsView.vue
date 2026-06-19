<script setup>
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, Printer } from 'lucide-vue-next';
import { get } from '../../services/apiClient.js';
import MiniBarChart from '../../components/admin/MiniBarChart.vue';

const reports = ref(null);
const live = ref([]);
const delays = ref([]);
const error = ref('');

async function load() {
  error.value = '';
  try {
    const [r, lm, dl] = await Promise.all([
      get('/api/admin/reports'),
      get('/api/admin/live-map').catch(() => []),
      get('/api/admin/delays').catch(() => []),
    ]);
    reports.value = r; live.value = lm || []; delays.value = dl || [];
  } catch (e) { error.value = e.message; }
}

const kpis = computed(() => {
  const r = reports.value || {};
  const onTime = live.value.filter((v) => !v.delayStatus || v.delayStatus === 'on_time').length;
  const pct = live.value.length ? Math.round((onTime / live.value.length) * 100) : 0;
  return [
    ['Active buses', r.totalBuses], ['Routes', r.totalRoutes], ['Stops', r.totalStops],
    ['Trips today', r.totalTrips], ['On-time %', `${pct}%`], ['Open incidents', r.openIncidents],
  ];
});

// Busiest routes by live bus count
const busiest = computed(() => {
  const m = {};
  for (const v of live.value) if (v.routeCode) m[v.routeCode] = (m[v.routeCode] || 0) + 1;
  return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);
});
// Fleet status distribution
const fleet = computed(() => {
  const c = { 'On time': 0, Minor: 0, Major: 0, Critical: 0 };
  for (const v of live.value) {
    const s = v.delayStatus || 'on_time';
    if (s === 'on_time') c['On time']++; else if (s === 'minor_delay') c.Minor++;
    else if (s === 'major_delay') c.Major++; else c.Critical++;
  }
  return Object.entries(c).map(([label, value]) => ({ label, value }));
});

function printReport() { window.print(); }

onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Analytics</div>
      <h1>Reports &amp; Analytics</h1>
      <p class="muted">Performance summary across the live network</p>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
      <button class="btn primary no-print" @click="printReport"><Printer size="16" /> Print report</button>
    </div>
  </div>

  <div v-if="error" class="error">{{ error }}</div>

  <section class="grid kpi-grid">
    <article v-for="[label, value] in kpis" :key="label" class="card stat">
      <div class="stat-top"><span>{{ label }}</span></div>
      <div class="stat-value">{{ value ?? '—' }}</div>
    </article>
  </section>

  <section class="grid two-col" style="margin-top:16px">
    <div class="card">
      <h2>Busiest Routes (live buses)</h2>
      <MiniBarChart :data="busiest" />
      <div class="legend">
        <span v-for="b in busiest" :key="b.label">{{ b.label }} · {{ b.value }}</span>
      </div>
    </div>
    <div class="card">
      <h2>Fleet Status Distribution</h2>
      <MiniBarChart :data="fleet" />
      <div class="legend">
        <span v-for="f in fleet" :key="f.label">{{ f.label }} · {{ f.value }}</span>
      </div>
    </div>
  </section>

  <section class="card" style="margin-top:16px">
    <h2>Most Delayed Trips Today</h2>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Line</th><th>Route</th><th>Bus</th><th>Delay (min)</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="(d, i) in delays" :key="i">
            <td>{{ d.routes?.route_code || '—' }}</td>
            <td>{{ d.routes?.route_name || '—' }}</td>
            <td>{{ d.buses?.plate_number || '—' }}</td>
            <td>{{ d.delay_minutes }}</td>
            <td><span class="badge" :class="d.status">{{ d.status }}</span></td>
          </tr>
          <tr v-if="!delays.length"><td colspan="5" class="muted" style="padding:14px">No delayed trips right now.</td></tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; font-size: 12px; color: var(--admin-muted); }
.legend span { background: var(--admin-surface-2); border: 1px solid var(--admin-border); padding: 3px 9px; border-radius: 20px; }
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 9px 12px; color: var(--admin-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--admin-border); }
.data-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); }
</style>
