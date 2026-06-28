<script setup>
import { computed, onMounted, ref } from 'vue';
import { RefreshCw, Check, Truck } from 'lucide-vue-next';
import { get, patch } from '../../services/apiClient.js';

const buses = ref([]);
const routes = ref([]);
const error = ref('');
const toast = ref('');
const search = ref('');
const savingId = ref('');
const draft = ref({}); // id -> { routeId, status }

const statuses = ['active', 'maintenance', 'inactive'];

async function load() {
  error.value = '';
  try {
    const [bs, rts] = await Promise.all([get('/api/admin/buses'), get('/api/admin/routes')]);
    buses.value = bs || [];
    routes.value = rts || [];
    draft.value = {};
    for (const b of buses.value) draft.value[b.id] = { routeId: b.current_route_id || '', status: b.status || 'active' };
  } catch (e) { error.value = e.message; }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return buses.value;
  return buses.value.filter((b) => `${b.bus_code} ${b.plate_number} ${b.routes?.route_code || ''}`.toLowerCase().includes(q));
});

function dirty(b) {
  const d = draft.value[b.id];
  return d && (d.routeId !== (b.current_route_id || '') || d.status !== (b.status || 'active'));
}

async function save(b) {
  const d = draft.value[b.id];
  savingId.value = b.id; error.value = '';
  try {
    await patch(`/api/admin/buses/${b.id}`, { routeId: d.routeId || null, status: d.status });
    toast.value = `${b.bus_code} updated.`;
    await load();
    setTimeout(() => (toast.value = ''), 3000);
  } catch (e) { error.value = e.message; }
  finally { savingId.value = ''; }
}

function removeRoute(b) { draft.value[b.id].routeId = ''; save(b); }

onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Fleet</div>
      <h1>Bus Management</h1>
      <p class="muted">Assign buses to routes, remove them, and set operating status</p>
    </div>
    <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
  </div>

  <transition name="toast"><div v-if="toast" class="toast-bar"><Check size="16" /> {{ toast }}</div></transition>
  <div v-if="error" class="error">{{ error }}</div>

  <section class="metric-strip">
    <div class="metric-tile"><div class="metric-label">Fleet size</div><div class="metric-number">{{ buses.length }}</div></div>
    <div class="metric-tile"><div class="metric-label">On a route</div><div class="metric-number">{{ buses.filter(b => b.current_route_id).length }}</div></div>
    <div class="metric-tile"><div class="metric-label">Active</div><div class="metric-number">{{ buses.filter(b => b.status === 'active').length }}</div></div>
    <div class="metric-tile"><div class="metric-label">Unassigned</div><div class="metric-number">{{ buses.filter(b => !b.current_route_id).length }}</div></div>
  </section>

  <div class="card table-panel">
    <div class="panel-head">
      <div><h2 style="margin-bottom:4px"><Truck size="16" /> Fleet</h2><div class="muted">Reassign or remove buses across routes.</div></div>
      <input v-model="search" class="input" placeholder="Search bus / plate / route" style="min-width:240px" />
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Bus</th><th>Plate</th><th>Capacity</th><th>Assigned route</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="b in filtered" :key="b.id" :class="{ dirty: dirty(b) }">
            <td><b>{{ b.bus_code }}</b></td>
            <td>{{ b.plate_number }}</td>
            <td>{{ b.capacity }}</td>
            <td>
              <select v-model="draft[b.id].routeId" class="select cell-select">
                <option value="">— Unassigned —</option>
                <option v-for="r in routes" :key="r.id" :value="r.id">{{ r.route_code }}</option>
              </select>
            </td>
            <td>
              <select v-model="draft[b.id].status" class="select cell-select">
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
            </td>
            <td class="row-actions">
              <button class="btn primary sm" :disabled="!dirty(b) || savingId === b.id" @click="save(b)">{{ savingId === b.id ? '…' : 'Save' }}</button>
              <button v-if="b.current_route_id" class="btn sm danger" @click="removeRoute(b)" title="Remove from route">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.toast-bar { display: flex; align-items: center; gap: 8px; background: rgba(20,199,132,.14); border: 1px solid rgba(20,199,132,.35); color: var(--admin-green); padding: 11px 14px; border-radius: 10px; margin-bottom: 14px; font-weight: 600; }
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 10px 12px; color: var(--admin-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--admin-border); }
.data-table td { padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,.05); }
.data-table tr.dirty td { background: rgba(41,182,246,.06); }
.cell-select { min-width: 130px; min-height: 34px; }
.row-actions { display: flex; gap: 6px; }
.btn.sm { min-height: 32px; padding: 0 11px; font-size: 12px; }
.btn.danger { color: #ff8d8e; border-color: rgba(255,77,79,.3); }
.btn.danger:hover { background: rgba(255,77,79,.12); }
</style>
