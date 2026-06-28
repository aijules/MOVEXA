<script setup>
import { nextTick, onMounted, onUnmounted, ref, computed } from 'vue';
import L from 'leaflet';
import { RefreshCw } from 'lucide-vue-next';
import { get } from '../../services/apiClient.js';

const KIGALI = [-1.9441, 30.0619];
const vehicles = ref([]);
const error = ref('');
const lastUpdate = ref(null);
let map, markers = {}, timer;

function statusColor(s) {
  if (s === 'critical_delay') return '#ff4d4f';
  if (s === 'major_delay') return '#ff9f1c';
  if (s && s.includes('delay')) return '#ffd43b';
  return '#14c784';
}
function statusLabel(s) {
  if (!s || s === 'on_time') return 'On time';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const counts = computed(() => {
  const c = { onTime: 0, minor: 0, major: 0, critical: 0 };
  for (const v of vehicles.value) {
    const s = v.delayStatus || 'on_time';
    if (s === 'on_time') c.onTime++;
    else if (s === 'minor_delay') c.minor++;
    else if (s === 'major_delay') c.major++;
    else c.critical++;
  }
  return c;
});

function render() {
  if (!map) return;
  const seen = new Set();
  for (const v of vehicles.value) {
    if (!v.lat || !v.lng) continue;
    const id = String(v.id || v.busId);
    seen.add(id);
    const color = statusColor(v.delayStatus);
    const html = `<div style="background:${color};color:#04140d;border-radius:8px;padding:2px 7px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:1.5px solid rgba(255,255,255,0.6)">🚌 ${v.routeCode || ''}</div>`;
    const popup = `<b>${v.routeCode || '—'}</b> · ${v.plateNumber || ''}<br>Next: ${v.nextStop?.name || '—'} (${v.nextStop?.etaMinutes ?? '—'} min)<br>Speed: ${Math.round(v.speedKph || 0)} km/h · ${statusLabel(v.delayStatus)}<br>Progress: ${Math.round(v.progressPercentage || 0)}%`;
    const icon = L.divIcon({ className: '', html, iconAnchor: [22, 12] });
    if (markers[id]) { markers[id].setLatLng([v.lat, v.lng]); markers[id].setIcon(icon); markers[id].getPopup()?.setContent(popup); }
    else markers[id] = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
  }
  for (const id of Object.keys(markers)) if (!seen.has(id)) { map.removeLayer(markers[id]); delete markers[id]; }
}

async function load() {
  error.value = '';
  try {
    vehicles.value = await get('/api/admin/live-map');
    lastUpdate.value = new Date();
    render();
  } catch (e) { error.value = e.message; }
}

onMounted(async () => {
  await nextTick();
  map = L.map('ops-map', { zoomControl: true, attributionControl: false }).setView(KIGALI, 12);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  await load();
  timer = setInterval(load, 5000);
});
onUnmounted(() => { clearInterval(timer); map?.remove(); map = null; });
</script>

<template>
  <div class="ops-wrap">
    <div class="ops-bar">
      <div class="ops-stats">
        <div class="ops-stat"><span class="dot on"></span> On time <b>{{ counts.onTime }}</b></div>
        <div class="ops-stat"><span class="dot minor"></span> Minor <b>{{ counts.minor }}</b></div>
        <div class="ops-stat"><span class="dot major"></span> Major <b>{{ counts.major }}</b></div>
        <div class="ops-stat"><span class="dot crit"></span> Critical <b>{{ counts.critical }}</b></div>
        <div class="ops-stat total">Live buses <b>{{ vehicles.length }}</b></div>
      </div>
      <div class="ops-actions">
        <span class="muted" v-if="lastUpdate">Updated {{ lastUpdate.toLocaleTimeString() }}</span>
        <button class="btn" @click="load"><RefreshCw size="15" /></button>
      </div>
    </div>
    <div v-if="error" class="error" style="margin:8px 0">{{ error }}</div>
    <div id="ops-map" class="ops-map"></div>
  </div>
</template>

<style scoped>
.ops-wrap { display: flex; flex-direction: column; height: calc(100vh - 120px); }
.ops-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.ops-stats { display: flex; gap: 10px; flex-wrap: wrap; }
.ops-stat { display: flex; align-items: center; gap: 7px; background: var(--admin-surface); border: 1px solid var(--admin-border); border-radius: 8px; padding: 7px 12px; font-size: 13px; }
.ops-stat b { color: #fff; }
.ops-stat.total { background: rgba(41,182,246,0.12); border-color: rgba(41,182,246,0.3); }
.dot { width: 9px; height: 9px; border-radius: 50%; }
.dot.on { background: #14c784; } .dot.minor { background: #ffd43b; } .dot.major { background: #ff9f1c; } .dot.crit { background: #ff4d4f; }
.ops-actions { display: flex; align-items: center; gap: 10px; }
.ops-map { flex: 1; border-radius: 10px; overflow: hidden; border: 1px solid var(--admin-border); min-height: 360px; }
</style>
