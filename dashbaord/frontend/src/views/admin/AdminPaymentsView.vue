<script setup>
import { onMounted, ref } from 'vue';
import { get } from '../../services/apiClient.js';

const rows = ref([]);
const loading = ref(false);
const error = ref('');
const status = ref('');
const date = ref('');
const source = ref('');

async function load() {
  loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams();
    if (status.value) params.set('status', status.value);
    if (date.value) params.set('date', date.value);
    if (source.value) params.set('source', source.value);
    rows.value = await get(`/api/admin/payments${params.size ? `?${params}` : ''}`) || [];
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}

function fmt(value) { return value ? new Date(value).toLocaleString('en-RW') : '—'; }
function mask(phone) { const s = String(phone || ''); return s.length > 6 ? `${s.slice(0, 5)}•••${s.slice(-3)}` : s || '—'; }
onMounted(load);
</script>

<template>
  <section>
    <div class="page-head"><div><h1>MoMo Payments</h1><p>Passenger app and USSD UrubutoPay transactions.</p></div></div>
    <div class="filters">
      <select v-model="status" @change="load"><option value="">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
      <select v-model="source" @change="load"><option value="">All channels</option><option value="app">Passenger app</option><option value="ussd">USSD</option></select>
      <input v-model="date" type="date" @change="load" />
      <button class="btn" @click="status='';source='';date='';load()">Clear</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="table-wrap">
      <table><thead><tr><th>Reference</th><th>Phone</th><th>Amount</th><th>Route</th><th>Channel</th><th>Status</th><th>Date/time</th><th>Provider ref</th></tr></thead>
      <tbody>
        <tr v-if="loading"><td colspan="8">Loading payments…</td></tr>
        <tr v-else-if="!rows.length"><td colspan="8">No payments match these filters.</td></tr>
        <tr v-for="p in rows" :key="p.id">
          <td><b>{{ p.ticket_reference || p.reference }}</b></td><td>{{ mask(p.payer_phone) }}</td>
          <td>{{ Number(p.amount).toLocaleString() }} {{ p.currency }}</td><td>{{ p.route_name || '—' }}</td>
          <td><span class="source">{{ p.source }}</span></td><td><span class="status" :class="p.display_status">{{ p.display_status }}</span></td>
          <td>{{ fmt(p.created_at) }}</td><td class="mono">{{ p.urubuto_reference || '—' }}</td>
        </tr>
      </tbody></table>
    </div>
  </section>
</template>

<style scoped>
.page-head{display:flex;justify-content:space-between;margin-bottom:18px}.page-head h1{font-size:24px}.page-head p{color:#73808d;margin-top:4px}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}.filters select,.filters input{padding:9px 11px;border:1px solid #d8e0e8;border-radius:8px;background:white}.table-wrap{overflow:auto;background:#fff;border:1px solid #e5eaf0;border-radius:12px}table{width:100%;border-collapse:collapse;min-width:1050px}th,td{padding:12px;text-align:left;border-bottom:1px solid #edf1f5;font-size:13px}th{background:#f7f9fb;color:#647180}.status,.source{display:inline-block;padding:4px 8px;border-radius:12px;text-transform:capitalize;font-weight:700}.status.paid{background:#dcfce7;color:#15803d}.status.pending{background:#fef3c7;color:#a16207}.status.failed,.status.expired{background:#fee2e2;color:#b91c1c}.source{background:#e0f2fe;color:#0369a1}.mono{font-family:monospace}.error{color:#b91c1c;margin-bottom:10px}
</style>
