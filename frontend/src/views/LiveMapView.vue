<template>
  <div class="map-page">
    <!-- Header -->
    <div class="map-header">
      <button class="back-btn" @click="router.push('/')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Live Map</h2>
      <div class="live-badge" :class="{ pulse: vehicleCount > 0 }">
        <span class="live-dot"></span>
        {{ vehicleCount }} bus{{ vehicleCount !== 1 ? 'es' : '' }}
      </div>
    </div>

    <!-- Route filter -->
    <div class="map-filters" v-if="linesStore.lines.length">
      <div class="filters-scroll">
        <button
          class="filter-btn" :class="{ active: !selectedRouteId }"
          @click="selectRoute(null)"
        >All</button>
        <button
          v-for="line in linesStore.lines.slice(0,20)" :key="line.id || line._id"
          class="filter-btn" :class="{ active: selectedRouteId === (line.id || line._id) }"
          :style="{ borderColor: selectedRouteId === (line.id || line._id) ? line.color : undefined }"
          @click="selectRoute(line.id || line._id)"
        >{{ line.shortName || line.route_code }}</button>
      </div>
    </div>

    <!-- Out-of-service banner -->
    <div v-if="!inService" class="service-banner">
      🌙 No buses running — service hours are <b>05:00–22:00</b>
    </div>

    <!-- Map -->
    <div id="live-map" class="leaflet-map"></div>

    <!-- Controls -->
    <div class="map-controls">
      <button class="map-ctrl-btn" @click="locateMe" title="My location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
      </button>
      <button class="map-ctrl-btn" @click="fitAll" title="Fit all buses">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14H10V20M20 10H14V4M4 10H10V4M20 14H14V20"/></svg>
      </button>
    </div>

    <!-- Bottom sheet -->
    <div class="map-bottom-sheet">
      <div class="sheet-handle"></div>
      <div class="sheet-content">
        <p class="sheet-title">Nearby Stops</p>
        <div class="sheet-stops">
          <router-link
            v-for="stop in displayStops.slice(0, 6)"
            :key="stop.id || stop._id"
            :to="`/stops/${stop.id || stop._id}`"
            class="sheet-stop"
          >
            <span class="sheet-stop-icon">🚏</span>
            <span class="sheet-stop-name">{{ fmtStop(stop.stop_name || stop.name) }}</span>
            <span v-if="stop.distance_meters" class="sheet-stop-dist text-muted">{{ fmtDist(stop.distance_meters) }}</span>
          </router-link>
          <p v-if="!displayStops.length" class="text-muted" style="font-size:13px;padding:4px 0">
            Tap "My location" to see nearby stops
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useVehicleStore } from '../stores/vehicleStore';
import { useStopsStore }   from '../stores/stopsStore';
import { useLinesStore }   from '../stores/linesStore';
import { routesApi } from '../services/api';
import { isInServiceNow } from '../composables/useBusProgress';

const router         = useRouter();
const vehicleStore   = useVehicleStore();
const stopsStore     = useStopsStore();
const linesStore     = useLinesStore();

const selectedRouteId = ref(null);
const KIGALI = [-1.9441, 30.0619];

let map           = null;
let busMarkers    = {};
const prevPos     = {}; // busId → [lat,lng] for animation

function animateMarker(marker, from, to, steps = 20) {
  let s = 0;
  const id = setInterval(() => {
    s++;
    const t = s / steps;
    marker.setLatLng([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    if (s >= steps) clearInterval(id);
  }, 50);
}
let polyline      = null;
let stopMarkers   = [];
let userMarker    = null;

const inService    = ref(isInServiceNow());
const vehicleCount = computed(() => inService.value ? vehicleStore.liveVehicles.length : 0);
const displayStops = computed(() => stopsStore.nearbyStops);

function clearBusMarkers() {
  for (const id in busMarkers) { map?.removeLayer(busMarkers[id]); delete busMarkers[id]; }
}

function fmtStop(name = '') {
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  const clean = isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
  return clean.length > 22 ? clean.slice(0, 21) + '…' : clean;
}
function fmtDist(m) { return m >= 1000 ? `${(m/1000).toFixed(1)}km` : `${m}m`; }

function delayLabel(status) {
  if (!status || status === 'on_time') return 'On time';
  if (status === 'minor_delay') return 'Minor delay';
  if (status === 'major_delay') return 'Major delay';
  return 'Critical';
}

function busColor(status) {
  if (status === 'critical_delay') return '#EF4444';
  if (status?.includes('delay')) return '#F59E0B';
  return '#16A34A';
}

async function initMap() {
  const L = await import('leaflet');
  map = L.map('live-map', { center: KIGALI, zoom: 13, zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
  renderBuses(L);
}

async function renderBuses(L) {
  if (!map) return;
  // Buses only run 05:00–22:00 — outside service hours the map shows no buses.
  inService.value = isInServiceNow();
  if (!inService.value) { clearBusMarkers(); return; }

  const seen = new Set();
  for (const v of vehicleStore.liveVehicles) {
    if (!v.lat || !v.lng) continue;
    const vid = String(v.id || v.busId || v.vehicleId);
    seen.add(vid);
    const color = busColor(v.delayStatus);
    const html = `
      <div style="background:${color};color:white;border-radius:10px;padding:3px 8px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;gap:4px;border:2px solid rgba(255,255,255,0.5)">
        🚌 ${v.routeCode || v.routeId?.slice(-6) || ''}
      </div>`;
    const icon = L.divIcon({ className: '', html, iconAnchor: [28, 14] });
    const popup = `<b>${v.routeCode || ''}</b><br>🚏 ${fmtStop(v.nextStop?.name || '–')}<br>⚡ ${Math.round(v.speedKph || 0)} km/h<br>${delayLabel(v.delayStatus)}<br>${Math.round(v.progressPercentage || 0)}% complete`;

    if (busMarkers[vid]) {
      const p = prevPos[vid];
      if (p && (p[0] !== v.lat || p[1] !== v.lng)) animateMarker(busMarkers[vid], p, [v.lat, v.lng]);
      else busMarkers[vid].setLatLng([v.lat, v.lng]);
    } else {
      busMarkers[vid] = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup);
    }
    prevPos[vid] = [v.lat, v.lng];   // remember for next tick's smooth glide
  }
  // Remove markers no longer in the current set (e.g. after filtering to one route).
  for (const id of Object.keys(busMarkers)) {
    if (!seen.has(id)) { map.removeLayer(busMarkers[id]); delete busMarkers[id]; delete prevPos[id]; }
  }
}

async function drawRouteLayer(routeId) {
  if (!map || !routeId) return;
  const L = await import('leaflet');

  // Clear old route layer
  if (polyline) { map.removeLayer(polyline); polyline = null; }
  for (const m of stopMarkers) map.removeLayer(m);
  stopMarkers = [];

  const [stopsRes, pathRes] = await Promise.all([
    routesApi.getStops(routeId).catch(() => ({ data: [] })),
    routesApi.getPath(routeId).catch(() => ({ data: { coordinates: [] } })),
  ]);

  const coords = pathRes.data?.coordinates || [];
  if (coords.length >= 2) {
    const latlngs = coords.map(c => [c[1], c[0]]);
    polyline = L.polyline(latlngs, { color: '#2563EB', weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 14 });
  }

  for (const stop of stopsRes.data || []) {
    if (!stop.latitude || !stop.longitude) continue;
    const m = L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
      radius: 5, fillColor: '#2563EB', color: '#fff', weight: 2, fillOpacity: 1,
    }).addTo(map).bindPopup(fmtStop(stop.stop_name || stop.name));
    stopMarkers.push(m);
  }
}

async function selectRoute(id) {
  selectedRouteId.value = id;
  if (id) {
    await drawRouteLayer(id);
    await vehicleStore.fetchLive(id);
  } else {
    if (polyline) { map?.removeLayer(polyline); polyline = null; }
    for (const m of stopMarkers) map?.removeLayer(m);
    stopMarkers = [];
    await vehicleStore.fetchLive();
  }
  const L = await import('leaflet');
  renderBuses(L);
}

async function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    map?.setView([lat, lng], 15);
    await stopsStore.fetchNearby(lat, lng);
    const L = await import('leaflet');
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([lat, lng], {
      radius: 10, fillColor: '#2563EB', color: '#fff', weight: 3, fillOpacity: 0.9,
    }).addTo(map).bindPopup('You are here');
    for (const stop of stopsStore.nearbyStops) {
      if (!stop.latitude || !stop.longitude) continue;
      const m = L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
        radius: 5, fillColor: '#0EA5A3', color: '#fff', weight: 2, fillOpacity: 1,
      }).addTo(map).bindPopup(fmtStop(stop.stop_name || stop.name));
      stopMarkers.push(m);
    }
  });
}

function fitAll() {
  const pts = vehicleStore.liveVehicles.filter(v => v.lat && v.lng).map(v => [v.lat, v.lng]);
  if (pts.length && map) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 });
  else map?.setView(KIGALI, 13);
}

let pollTimer = null;

onMounted(async () => {
  await vehicleStore.fetchLive();
  linesStore.fetchLines();
  await initMap();
  pollTimer = setInterval(async () => {
    await vehicleStore.fetchLive(selectedRouteId.value || undefined);
    const L = await import('leaflet');
    renderBuses(L);
  }, 3000);
});

onUnmounted(() => {
  clearInterval(pollTimer);
  map?.remove();
  map = null;
});
</script>

<style scoped>
.map-page { display: flex; flex-direction: column; height: 100dvh; position: relative; }

.map-header {
  position: absolute; top: 0; left: 0; right: 0; z-index: 1000;
  display: flex; align-items: center; gap: 12px; padding: 14px 16px;
  background: linear-gradient(to bottom, rgba(255,255,255,0.96), transparent);
}
.back-btn { width: 40px; height: 40px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-sm); flex-shrink: 0; }
.back-btn svg { width: 20px; height: 20px; }
h2 { font-size: 18px; flex: 1; }
.live-badge { display: flex; align-items: center; gap: 6px; background: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; box-shadow: var(--shadow-sm); }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-danger); }
.live-badge.pulse .live-dot { animation: pulse 1.5s ease infinite; }
@keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }

.map-filters {
  position: absolute; top: 62px; left: 0; right: 0; z-index: 999; padding: 0 12px;
}
.filters-scroll { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 4px 2px; }
.filters-scroll::-webkit-scrollbar { display: none; }
.filter-btn {
  flex-shrink: 0; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 700;
  background: white; border: 2px solid var(--color-border); cursor: pointer;
  box-shadow: var(--shadow-sm); transition: all 0.15s; color: var(--color-text);
}
.filter-btn.active { background: var(--color-primary); border-color: var(--color-primary); color: white; }

.service-banner {
  position: absolute; top: 104px; left: 12px; right: 12px; z-index: 999;
  background: #1E293B; color: #E2E8F0; font-size: 12.5px; font-weight: 600;
  padding: 9px 14px; border-radius: 12px; text-align: center; box-shadow: var(--shadow-md);
}

.leaflet-map { flex: 1; z-index: 1; min-height: 0; }

.map-controls {
  position: absolute; right: 12px; bottom: 230px; z-index: 1000;
  display: flex; flex-direction: column; gap: 8px;
}
.map-ctrl-btn { width: 44px; height: 44px; border-radius: 50%; background: white; box-shadow: var(--shadow-md); display: flex; align-items: center; justify-content: center; }
.map-ctrl-btn svg { width: 20px; height: 20px; }

.map-bottom-sheet {
  position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
  background: var(--color-surface); border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,0.12); padding: 10px 0 0;
}
.sheet-handle { width: 40px; height: 4px; background: var(--color-border); border-radius: 2px; margin: 0 auto 8px; }
.sheet-content { padding: 0 16px 16px; }
.sheet-title { font-size: 12px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
.sheet-stops { display: flex; flex-direction: column; gap: 2px; max-height: 130px; overflow-y: auto; }
.sheet-stop { display: flex; align-items: center; gap: 10px; padding: 7px 4px; font-size: 13px; }
.sheet-stop-icon { font-size: 15px; }
.sheet-stop-name { flex: 1; font-weight: 600; }
.sheet-stop-dist { font-size: 11px; }
</style>
