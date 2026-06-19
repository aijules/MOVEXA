<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { Html5Qrcode } from 'html5-qrcode';
import { post } from '../../services/apiClient.js';

const value = ref('');
const result = ref(null);
const loading = ref(false);
const scanning = ref(false);
let scanner = null;

async function verify(raw = value.value) {
  const clean = String(raw || '').trim();
  if (!clean) return;
  value.value = clean; loading.value = true; result.value = null;
  try {
    const res = await post('/api/tickets/validate', { value: clean });
    result.value = { kind: 'valid', label: 'Valid ticket', data: res.data };
  } catch (e) {
    const kind = e.body?.result || 'invalid';
    const labels = { already_used: 'Already used', expired: 'Expired', invalid: 'Invalid ticket' };
    result.value = { kind, label: labels[kind] || 'Invalid ticket', data: e.body?.data, message: e.message };
  } finally { loading.value = false; }
}

async function startCamera() {
  result.value = null;
  try {
    scanner = scanner || new Html5Qrcode('qr-reader');
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) throw new Error('No camera found');
    scanning.value = true;
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, async text => { await stopCamera(); await verify(text); });
  } catch (e) { scanning.value = false; result.value = { kind: 'invalid', label: 'Camera unavailable', message: e.message }; }
}
async function stopCamera() { if (scanner?.isScanning) await scanner.stop(); scanning.value = false; }
async function scanFile(event) {
  const file = event.target.files?.[0]; if (!file) return;
  try { scanner = scanner || new Html5Qrcode('qr-reader'); await verify(await scanner.scanFile(file, true)); }
  catch (e) { result.value = { kind: 'invalid', label: 'QR not recognised', message: e.message }; }
  event.target.value = '';
}
onBeforeUnmount(stopCamera);
</script>

<template>
  <section class="verify-page">
    <h1>Verify Ticket</h1><p class="muted">Scan an app QR code or enter a MOVEXA reference from a USSD passenger.</p>
    <div class="verify-grid">
      <div class="panel">
        <div id="qr-reader"></div>
        <button v-if="!scanning" class="btn primary" @click="startCamera">Start QR scanner</button>
        <button v-else class="btn" @click="stopCamera">Stop scanner</button>
        <label class="upload">Scan QR image<input type="file" accept="image/*" @change="scanFile" /></label>
        <div class="or">or enter ticket reference</div>
        <div class="manual"><input v-model="value" placeholder="MOVEXA-XXXXXXXX" @keyup.enter="verify()" /><button class="btn primary" :disabled="loading" @click="verify()">{{ loading ? 'Checking…' : 'Verify' }}</button></div>
      </div>
      <div v-if="result" class="result panel" :class="result.kind">
        <h2>{{ result.label }}</h2><p v-if="result.message">{{ result.message }}</p>
        <dl v-if="result.data"><dt>Reference</dt><dd>{{ result.data.ticketReference }}</dd><dt>Route</dt><dd>{{ result.data.route }}</dd><dt>Payment</dt><dd>{{ result.data.paymentStatus }}</dd><dt>Source</dt><dd>{{ result.data.source }}</dd><dt>Valid until</dt><dd>{{ new Date(result.data.validUntil).toLocaleString('en-RW') }}</dd></dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.verify-page h1{font-size:24px}.muted{color:#73808d;margin:5px 0 18px}.verify-grid{display:grid;grid-template-columns:minmax(320px,560px) minmax(280px,1fr);gap:18px}.panel{background:#fff;border:1px solid #e3e9ef;border-radius:14px;padding:20px}.primary{background:#0d9488;color:white}.upload{display:inline-block;margin-left:8px;padding:8px 12px;border:1px solid #d6dee6;border-radius:8px;cursor:pointer}.upload input{display:none}.or{text-align:center;color:#7b8794;margin:20px 0}.manual{display:flex;gap:8px}.manual input{flex:1;padding:11px;border:1px solid #d6dee6;border-radius:8px;font-family:monospace}.result{border-left:6px solid #dc2626}.result.valid{border-color:#16a34a;background:#f0fdf4}.result.already_used{border-color:#d97706;background:#fffbeb}.result.expired{border-color:#dc2626;background:#fef2f2}.result h2{margin-bottom:12px}.result dl{display:grid;grid-template-columns:100px 1fr;gap:9px;font-size:14px}.result dt{color:#64748b}.result dd{font-weight:700}#qr-reader{margin-bottom:12px;overflow:hidden}@media(max-width:800px){.verify-grid{grid-template-columns:1fr}}
</style>
