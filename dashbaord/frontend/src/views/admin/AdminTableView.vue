<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RefreshCw, Search, Inbox } from 'lucide-vue-next';
import { get } from '../../services/apiClient.js';

const props = defineProps({ resource: String, title: String });

// Per-resource config → real :5000 read-only endpoints.
const CONFIG = {
  routes: {
    endpoint: '/api/admin/routes', desc: 'All operating routes in the Kigali network.',
    columns: [
      { key: 'route_code', label: 'Line' }, { key: 'route_name', label: 'Route name' },
      { key: 'origin_name', label: 'From' }, { key: 'destination_name', label: 'To' },
      { key: 'total_distance_km', label: 'Distance (km)' },
      { key: 'estimated_duration_minutes', label: 'Duration (min)' },
      { key: 'color', label: 'Colour', type: 'color' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
  },
  stops: {
    endpoint: '/api/admin/stops', desc: 'Bus stops with coordinates.',
    columns: [
      { key: 'stop_code', label: 'Code' }, { key: 'stop_name', label: 'Stop name' },
      { key: 'area', label: 'Area' }, { key: 'latitude', label: 'Lat' }, { key: 'longitude', label: 'Lng' },
      { key: 'is_active', label: 'Active', type: 'badge' },
    ],
  },
  schedules: {
    endpoint: '/api/admin/schedules', desc: 'Daily timetable — departure and arrival times per route.',
    columns: [
      { key: 'routes.route_code', label: 'Line' }, { key: 'routes.route_name', label: 'Route' },
      { key: 'departure_time', label: 'Departs' }, { key: 'arrival_time', label: 'Arrives' },
      { key: 'is_active', label: 'Active', type: 'badge' },
    ],
  },
  buses: {
    endpoint: '/api/admin/buses', desc: 'Fleet vehicles (GPS-equipped — no driver app required).',
    columns: [
      { key: 'bus_code', label: 'Bus code' }, { key: 'plate_number', label: 'Plate' },
      { key: 'capacity', label: 'Capacity' }, { key: 'routes.route_code', label: 'Route' },
      { key: 'status', label: 'Status', type: 'badge' },
    ],
  },
  trips: {
    endpoint: '/api/admin/trips', desc: 'Today’s active and scheduled trips.',
    columns: [
      { key: 'routes.route_code', label: 'Line' }, { key: 'buses.plate_number', label: 'Bus' },
      { key: 'drivers.full_name', label: 'Driver' }, { key: 'start_time', label: 'Start' },
      { key: 'delay_minutes', label: 'Delay (min)' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
  },
  eta: {
    endpoint: '/api/admin/live-map', desc: 'Predicted ETA to next stop, per live bus.',
    transform: (rows) => (rows || []).map((v) => ({
      routeCode: v.routeCode, plate: v.plateNumber,
      currentStop: v.currentStop?.name, nextStop: v.nextStop?.name,
      eta: v.nextStop?.etaMinutes != null ? `${v.nextStop.etaMinutes} min` : '—',
      speed: v.speedKph != null ? `${Math.round(v.speedKph)} km/h` : '—',
      delay: v.delayMinutes || 0, status: v.delayStatus,
    })),
    columns: [
      { key: 'routeCode', label: 'Line' }, { key: 'plate', label: 'Bus' },
      { key: 'currentStop', label: 'Current stop' }, { key: 'nextStop', label: 'Next stop' },
      { key: 'eta', label: 'ETA next stop' }, { key: 'speed', label: 'Speed' },
      { key: 'delay', label: 'Delay (min)' }, { key: 'status', label: 'Status', type: 'badge' },
    ],
  },
  adaptive: {
    endpoint: '/api/admin/adaptive-actions', desc: 'Engine recommendations from delay, congestion and demand analysis.',
    columns: [
      { key: 'routes.route_code', label: 'Line' }, { key: 'action_type', label: 'Recommended action' },
      { key: 'reason', label: 'Reason' }, { key: 'severity', label: 'Severity', type: 'badge' },
      { key: 'status', label: 'Status', type: 'badge' }, { key: 'created_at', label: 'Created', type: 'datetime' },
    ],
  },
  incidents: {
    endpoint: '/api/admin/incidents', desc: 'Active and historical incidents affecting service.',
    columns: [
      { key: 'type', label: 'Type' }, { key: 'title', label: 'Title' },
      { key: 'routes.route_code', label: 'Line' }, { key: 'severity', label: 'Severity', type: 'badge' },
      { key: 'status', label: 'Status', type: 'badge' }, { key: 'starts_at', label: 'Started', type: 'datetime' },
    ],
  },
  feedback: {
    endpoint: '/api/admin/feedback', desc: 'Passenger complaints, ratings and suggestions.',
    columns: [
      { key: 'type', label: 'Type' }, { key: 'message', label: 'Message' },
      { key: 'rating', label: 'Rating' }, { key: 'routes.route_code', label: 'Route' },
      { key: 'status', label: 'Status', type: 'badge' }, { key: 'created_at', label: 'Received', type: 'datetime' },
    ],
  },
  ussd: {
    endpoint: '/api/admin/ussd', desc: 'Feature-phone USSD activity (Africa’s Talking sandbox).',
    columns: [
      { key: 'phone_number', label: 'Phone' }, { key: 'text', label: 'Input' },
      { key: 'service_code', label: 'Service code' }, { key: 'response_type', label: 'Type', type: 'badge' },
      { key: 'created_at', label: 'When', type: 'datetime' },
    ],
  },
};

const cfg = computed(() => CONFIG[props.resource] || { endpoint: null, columns: [], desc: '' });
const rows = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
let timer;

function deepGet(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function cell(row, col) {
  let v = deepGet(row, col.key);
  if (v == null || v === '') return '—';
  if (col.type === 'datetime') return new Date(v).toLocaleString();
  if (typeof v === 'boolean') return v ? 'Active' : 'Inactive';
  if (typeof v === 'number' && !Number.isInteger(v)) return v.toFixed(2);
  return v;
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return rows.value;
  return rows.value.filter((r) => cfg.value.columns.some((c) => String(deepGet(r, c.key) ?? '').toLowerCase().includes(q)));
});
const activeCount = computed(() => rows.value.filter((r) =>
  r.is_active === true || ['active', 'open', 'on_time', 'pending'].includes(String(r.status || r.delayStatus || '').toLowerCase())).length);

async function load() {
  error.value = '';
  if (!cfg.value.endpoint) { rows.value = []; loading.value = false; return; }
  try {
    const data = await get(cfg.value.endpoint);
    rows.value = cfg.value.transform ? cfg.value.transform(data) : (data || []);
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

function start() {
  loading.value = true; rows.value = []; load();
  clearInterval(timer);
  if (cfg.value.endpoint) timer = setInterval(load, 18000);
}

watch(() => props.resource, start);
onMounted(start);
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Module</div>
      <h1>{{ title }}</h1>
      <p class="muted">{{ cfg.desc }}</p>
    </div>
    <span class="badge readonly">Read-only</span>
  </div>

  <section class="metric-strip">
    <div class="metric-tile"><div class="metric-label">Records</div><div class="metric-number">{{ rows.length.toLocaleString() }}</div></div>
    <div class="metric-tile"><div class="metric-label">Active / Open</div><div class="metric-number">{{ activeCount.toLocaleString() }}</div></div>
    <div class="metric-tile"><div class="metric-label">Showing</div><div class="metric-number">{{ filtered.length.toLocaleString() }}</div></div>
    <div class="metric-tile"><div class="metric-label">Source</div><div class="metric-number" style="font-size:16px">Supabase</div></div>
  </section>

  <div class="card table-panel">
    <div class="panel-head">
      <div>
        <h2 style="margin-bottom:4px">{{ title }}</h2>
        <div class="muted">Live read-only view from the operational database.</div>
      </div>
      <div class="toolbar">
        <input v-model="search" class="input" placeholder="Search…" style="min-width:220px" />
        <button class="btn" @click="load"><RefreshCw size="15" /></button>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="empty">Loading…</div>

    <div v-else-if="!cfg.endpoint" class="empty awaiting">
      <Inbox size="28" />
      <p>{{ cfg.emptyNote }}</p>
    </div>

    <div v-else-if="!filtered.length" class="empty">No records found.</div>

    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th v-for="c in cfg.columns" :key="c.key">{{ c.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in filtered" :key="i">
            <td v-for="c in cfg.columns" :key="c.key">
              <span v-if="c.type === 'badge'" class="badge" :class="String(deepGet(row, c.key)).toLowerCase()">{{ cell(row, c) }}</span>
              <span v-else-if="c.type === 'color'" class="color-cell"><i :style="{ background: deepGet(row, c.key) || '#888' }"></i>{{ cell(row, c) }}</span>
              <span v-else>{{ cell(row, c) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; margin-top: 4px; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th {
  text-align: left; padding: 10px 12px; color: var(--admin-muted);
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
  border-bottom: 1px solid var(--admin-border); white-space: nowrap;
}
.data-table td { padding: 11px 12px; border-bottom: 1px solid rgba(255,255,255,0.05); white-space: nowrap; }
.data-table tbody tr:hover { background: rgba(255,255,255,0.03); }
.color-cell { display: inline-flex; align-items: center; gap: 7px; }
.color-cell i { width: 14px; height: 14px; border-radius: 4px; display: inline-block; border: 1px solid rgba(255,255,255,0.2); }
.empty.awaiting { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 40px 20px; color: var(--admin-muted); text-align: center; }
.empty.awaiting p { max-width: 460px; line-height: 1.5; }
</style>
