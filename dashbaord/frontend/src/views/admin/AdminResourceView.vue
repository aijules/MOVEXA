<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { Database, Lock, RefreshCw, Search, ShieldCheck } from 'lucide-vue-next';
import { get } from '../../services/apiClient.js';
import AdminDataTable from '../../components/admin/AdminDataTable.vue';

const props = defineProps({ resource: String, title: String });
const rows = ref([]);
const pagination = ref({});
const loading = ref(true);
const error = ref('');
const search = ref('');
const page = ref(1);

const columns = computed(() => {
  const sample = rows.value[0] || {};
  const preferred = {
    routes: ['routeId', 'shortName', 'direction', 'longName', 'stops', 'totalDistanceKm', 'status'],
    stops: ['stopId', 'name', 'location', 'routes', 'status'],
    paths: ['routeId', 'pointCount', 'source', 'status', 'updatedAt'],
    schedules: ['routeId', 'stopId', 'departureTime', 'arrivalTime', 'serviceDay', 'active'],
    fleet: ['plate', 'institution', 'status', 'routeId', 'occupancyStatus', 'passengerCount', 'lastUpdate'],
    drivers: ['name', 'phone', 'assignedVehicle', 'assignedRoute', 'status'],
    trips: ['routeId', 'vehicleId', 'driverId', 'status', 'startTime', 'delayMinutes'],
    eta: ['routeId', 'stopId', 'scheduledTime', 'predictedTime', 'delayMinutes', 'confidence'],
    tickets: ['type', 'amount', 'passenger', 'routeId', 'status', 'paymentMethod'],
    payments: ['amount', 'method', 'status', 'createdAt'],
    incidents: ['type', 'routeId', 'vehicleId', 'severity', 'status', 'estimatedDelayMinutes'],
    feedback: ['type', 'rating', 'routeId', 'status', 'message'],
    'imports/jobs': ['type', 'originalFilename', 'status', 'totalRows', 'validRows', 'invalidRows', 'createdAt'],
    settings: ['key', 'value', 'group', 'description'],
    'audit-logs': ['action', 'resourceType', 'method', 'path', 'createdAt']
  };
  const keys = preferred[props.resource] || Object.keys(sample).filter((key) => !key.startsWith('_')).slice(0, 8);
  return keys.map((key) => ({ key, label: labelFor(key), badge: ['status', 'severity', 'active'].includes(key), format }));
});

const collectionLabel = computed(() => props.resource.replace('/jobs', '').replace('-', ' '));
const totalCount = computed(() => pagination.value.total || 0);
const visibleCount = computed(() => rows.value.length);
const activeCount = computed(() => rows.value.filter((row) => (
  row.isActive === true || ['active', 'open', 'completed'].includes(String(row.status || '').toLowerCase())
)).length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await get(`/api/admin/${props.resource}?page=${page.value}&limit=20&search=${encodeURIComponent(search.value)}`);
    rows.value = result.data || [];
    pagination.value = result.pagination || {};
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function format(value) {
  if (Array.isArray(value)) return `${value.length} items`;
  if (value?.type === 'Point') return value.coordinates?.join(', ');
  if (typeof value === 'object' && value) return JSON.stringify(value).slice(0, 80);
  return value ?? '-';
}

function labelFor(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase());
}

watch(() => props.resource, () => { page.value = 1; load(); });
onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Admin Module</div>
      <h1>{{ title }}</h1>
      <p class="muted">MongoDB-backed operational view with safe read-only controls for the current database.</p>
    </div>
    <span class="badge readonly">Read-only</span>
  </div>

  <div class="resource-shell">
    <section class="metric-strip">
      <div class="metric-tile">
        <div class="metric-label">Total Records</div>
        <div class="metric-number">{{ totalCount.toLocaleString() }}</div>
      </div>
      <div class="metric-tile">
        <div class="metric-label">Visible Rows</div>
        <div class="metric-number">{{ visibleCount.toLocaleString() }}</div>
      </div>
      <div class="metric-tile">
        <div class="metric-label">Active / Open</div>
        <div class="metric-number">{{ activeCount.toLocaleString() }}</div>
      </div>
      <div class="metric-tile">
        <div class="metric-label">Source</div>
        <div class="metric-number" style="font-size:18px; text-transform:capitalize">{{ collectionLabel }}</div>
      </div>
    </section>

    <div class="card table-panel">
      <div class="panel-head">
        <div>
          <h2 style="margin-bottom:4px">{{ title }} Registry</h2>
          <div class="muted">Search, scan, and audit records from the existing movexa database.</div>
        </div>
        <div class="toolbar">
          <div style="min-width:240px; position:relative">
            <input v-model="search" class="input" placeholder="Search records" @keyup.enter="load" />
          </div>
          <button class="btn" @click="load"><Search size="17" /> Search</button>
          <button class="btn" @click="load"><RefreshCw size="17" /> Refresh</button>
        </div>
      </div>
      <AdminDataTable :rows="rows" :columns="columns" :loading="loading" :error="error" />
      <div class="toolbar" style="margin:0; padding:14px 16px; justify-content:space-between; border-top:1px solid var(--admin-border)">
        <span class="muted">Page {{ pagination.page || page }} of {{ pagination.pages || 1 }} · {{ totalCount.toLocaleString() }} records</span>
        <div style="display:flex; gap:8px">
          <button class="btn" :disabled="page <= 1" @click="page--; load()">Previous</button>
          <button class="btn" :disabled="page >= (pagination.pages || 1)" @click="page++; load()">Next</button>
        </div>
      </div>
    </div>

    <section class="assurance-grid">
      <div class="card list-item"><Database size="18" color="var(--admin-cyan)" /><span>Connected to MongoDB</span></div>
      <div class="card list-item"><Lock size="18" color="var(--admin-yellow)" /><span>Write actions disabled</span></div>
      <div class="card list-item"><ShieldCheck size="18" color="var(--admin-green)" /><span>RBAC protected endpoint</span></div>
    </section>
  </div>
</template>
