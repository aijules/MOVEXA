<script setup>
import { computed, onMounted, ref } from 'vue';
import { MapPin, Plus, Trash2, RefreshCw, Check } from 'lucide-vue-next';
import { get, post, del } from '../../services/apiClient.js';

const stops = ref([]);
const error = ref('');
const toast = ref('');
const search = ref('');
const saving = ref(false);
const form = ref({ stop_name: '', area: '', latitude: '', longitude: '' });

async function load() {
  try { stops.value = await get('/api/admin/stops'); error.value = ''; }
  catch (e) { error.value = e.message; }
}
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? stops.value.filter(s => `${s.stop_name} ${s.area || ''} ${s.stop_code}`.toLowerCase().includes(q)) : stops.value;
});

async function add() {
  if (!form.value.stop_name.trim() || form.value.latitude === '' || form.value.longitude === '') { error.value = 'Name and coordinates are required'; return; }
  saving.value = true; error.value = '';
  try {
    await post('/api/admin/stops', form.value);
    toast.value = `Stop "${form.value.stop_name}" added.`;
    form.value = { stop_name: '', area: '', latitude: '', longitude: '' };
    await load();
    setTimeout(() => (toast.value = ''), 3000);
  } catch (e) { error.value = e.message; }
  finally { saving.value = false; }
}

async function remove(s) {
  if (!confirm(`Remove stop "${s.stop_name}"?`)) return;
  try { await del(`/api/admin/stops/${s.id}`); await load(); }
  catch (e) { error.value = e.message; }
}

onMounted(load);
</script>

<template>
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Network</div>
      <h1>Stops Management</h1>
      <p class="muted">Add new bus stops or remove them from the network</p>
    </div>
    <button class="btn" @click="load"><RefreshCw size="16" /> Refresh</button>
  </div>

  <transition name="toast"><div v-if="toast" class="toast-bar"><Check size="16" /> {{ toast }}</div></transition>
  <div v-if="error" class="error">{{ error }}</div>

  <section class="grid two-col">
    <div class="card add-card">
      <h2><Plus size="16" /> Add a Stop</h2>
      <label class="block">Stop name<input v-model="form.stop_name" class="input" placeholder="e.g. Kimironko Market" /></label>
      <label class="block">Area<input v-model="form.area" class="input" placeholder="e.g. Gasabo" /></label>
      <div class="form-grid">
        <label>Latitude<input v-model="form.latitude" class="input" placeholder="-1.9536" /></label>
        <label>Longitude<input v-model="form.longitude" class="input" placeholder="30.1265" /></label>
      </div>
      <button class="btn primary block" :disabled="saving" @click="add"><Plus size="15" /> {{ saving ? 'Adding…' : 'Add stop' }}</button>
    </div>

    <div class="card table-panel">
      <div class="panel-head">
        <div><h2 style="margin-bottom:4px"><MapPin size="16" /> Stops</h2><div class="muted">{{ stops.length }} stops in the network</div></div>
        <input v-model="search" class="input" placeholder="Search stops" style="min-width:220px" />
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Code</th><th>Name</th><th>Area</th><th>Lat</th><th>Lng</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in filtered.slice(0, 80)" :key="s.id">
              <td>{{ s.stop_code }}</td><td><b>{{ s.stop_name }}</b></td><td>{{ s.area || '—' }}</td>
              <td>{{ Number(s.latitude).toFixed(4) }}</td><td>{{ Number(s.longitude).toFixed(4) }}</td>
              <td><button class="btn sm danger" @click="remove(s)"><Trash2 size="14" /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.toast-bar { display: flex; align-items: center; gap: 8px; background: rgba(14,165,113,.12); border: 1px solid rgba(14,165,113,.3); color: #0a7d56; padding: 11px 14px; border-radius: 10px; margin-bottom: 14px; font-weight: 600; }
.block { display: block; margin-bottom: 12px; }
label { font-size: 12px; color: var(--admin-muted); font-weight: 600; }
.input { margin-top: 6px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.block.btn, .btn.block { width: 100%; justify-content: center; }
.table-wrap { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 10px 12px; color: var(--admin-muted); font-size: 11px; text-transform: uppercase; border-bottom: 1px solid var(--admin-border); }
.data-table td { padding: 9px 12px; border-bottom: 1px solid var(--admin-border); }
.btn.sm { min-height: 32px; padding: 0 10px; }
.btn.danger { color: #c01740; border-color: rgba(225,29,72,.3); }
.btn.danger:hover { background: rgba(225,29,72,.1); }
</style>
