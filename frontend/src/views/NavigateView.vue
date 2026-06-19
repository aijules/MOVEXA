<template>
  <div class="navigate" :class="`navigate--${status.key}`">
    <!-- Top summary strip -->
    <div class="nav-top">
      <button class="nav-back" @click="exit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div class="nav-trip">
        <span class="nav-line" :style="{ background: journey?.routeColor || '#0EA5A3' }">{{ journey?.routeCode }}</span>
        <span class="nav-trip-txt">{{ fmtStop(journey?.fromStop?.name) }} → {{ fmtStop(journey?.toStop?.name) }}</span>
      </div>
    </div>

    <!-- Phase banner: waiting to board vs en route -->
    <div v-if="phaseLabel" class="nav-phase" :class="hasDeparted ? 'enroute' : 'waiting'">
      <span class="nav-phase-dot"></span>{{ phaseLabel }}
    </div>

    <!-- 3 stat cards (adapt to approach vs ride phase) -->
    <div class="nav-stats">
      <div class="nav-stat">
        <span class="nav-stat-label">{{ stat1.label }}</span>
        <span class="nav-stat-value">{{ stat1.value }}<small>{{ stat1.unit }}</small></span>
      </div>
      <div class="nav-stat">
        <span class="nav-stat-label">{{ stat2.label }}</span>
        <span class="nav-stat-value nav-stat-value--dot">
          {{ stat2.value }}
          <span class="nav-stop-dot" :style="{ background: journey?.routeColor || '#0EA5A3' }"></span>
        </span>
      </div>
      <div class="nav-stat">
        <span class="nav-stat-label">Status</span>
        <span class="nav-stat-value nav-stat-status" :class="`status-${status.key}`">{{ status.label }}</span>
      </div>
    </div>

    <!-- Map + side timeline -->
    <div class="nav-body">
      <div id="nav-map" class="nav-map"></div>

      <div class="nav-timeline">
        <div class="ntl-head">
          <span class="ntl-head-count">{{ stat2.value }}</span>
          <span class="ntl-head-label">{{ hasDeparted ? 'stops remaining' : 'stops to pickup' }}</span>
        </div>
        <div class="ntl-scroll" ref="listRef">
          <div
            v-for="(s, i) in segmentList" :key="s.id || i"
            class="stl-row"
            :class="rowState(i)"
          >
            <div class="stl-marker">
              <div class="stl-dot"
                :class="{ pickup: rowState(i) === 'pickup', dest: rowState(i) === 'dest' }"
                :style="rowState(i) === 'passed' || rowState(i) === 'current' ? { borderColor: journey?.routeColor || '#0EA5A3' } : {}">
                <span v-if="rowState(i) === 'current'" class="stl-bus">🚌</span>
                <span v-else-if="rowState(i) === 'passed'" class="stl-check">✓</span>
              </div>
              <div v-if="i < segmentList.length - 1" class="stl-line" :class="{ done: rowState(i) === 'passed' }" :style="rowState(i) === 'passed' ? { background: journey?.routeColor || '#0EA5A3' } : {}"></div>
            </div>
            <div class="stl-body">
              <p class="stl-name">{{ fmtStop(s.stop_name || s.name) }}</p>
              <p class="stl-tag">{{ rowTag(i) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Get-off alert -->
    <transition name="slide-up">
      <div v-if="getOffAlert" class="getoff-alert" @click="getOffAlert = false">
        <div class="getoff-icon">🔔</div>
        <div>
          <p class="getoff-title">Get off at the next stop!</p>
          <p class="getoff-sub">{{ fmtStop(journey?.toStop?.name) }} is coming up</p>
        </div>
      </div>
    </transition>

    <div v-if="!journey" class="nav-empty">
      <p>No active journey.</p>
      <button class="btn btn-outline" @click="router.push('/planner')">Plan a journey</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useJourneyStore } from '../stores/journeyStore';
import { useVehicleStore } from '../stores/vehicleStore';
import { routesApi } from '../services/api';

const router       = useRouter();
const journeyStore = useJourneyStore();
const vehicleStore = useVehicleStore();

const journey    = computed(() => journeyStore.selectedJourney);
const routeStops = ref([]);
const routePath  = ref([]);
const userPos    = ref(null);
const now        = ref(Date.now());
const getOffAlert = ref(false);
const alertFired  = ref(false);

const liveBus = computed(() =>
  vehicleStore.liveVehicles.find(v =>
    v.routeId === journey.value?.routeId || v.routeCode === journey.value?.routeCode) || null);

function fmtStop(name = '') {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  const clean = isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
  return clean.length > 22 ? clean.slice(0, 21) + '…' : clean;
}
const norm = s => String(s || '').toLowerCase().trim();

const pickupIdx = computed(() => routeStops.value.findIndex(s => s.id === journey.value?.fromStop?.id));
const destIdx   = computed(() => routeStops.value.findIndex(s => s.id === journey.value?.toStop?.id));
const busStopIdx = computed(() => {
  const cur = liveBus.value?.currentStop?.name;
  if (!cur || !routeStops.value.length) return -1;
  return routeStops.value.findIndex(s => norm(s.stop_name || s.name) === norm(cur));
});

// How many stops BEFORE the pickup to show the bus approaching from.
const APPROACH_STOPS = 5;
const approachStart = computed(() =>
  pickupIdx.value >= 0 ? Math.max(0, pickupIdx.value - APPROACH_STOPS) : 0);

// Visible list spans the approach stops → your pickup → your destination.
const segmentList = computed(() => {
  if (pickupIdx.value >= 0 && destIdx.value > pickupIdx.value) {
    return routeStops.value.slice(approachStart.value, destIdx.value + 1);
  }
  const j = journey.value;
  return [{ id: 'from', stop_name: j?.fromStop?.name }, { id: 'to', stop_name: j?.toStop?.name }];
});
// Row index (within the visible list) of the pickup and destination.
const pickupRow = computed(() => Math.max(0, pickupIdx.value - approachStart.value));
const destRow   = computed(() => Math.max(0, destIdx.value - approachStart.value));

// ── REAL-TIME, service-aware tracking ──────────────────────────────────────────
// Driven by the real clock. Buses run 05:00–22:00. The bus departs your pickup at
// the journey's departure time and takes REAL minutes between stops (distance ÷
// speed / dataset times). The get-off countdown only runs once it has departed.
const SERVICE_START_MIN = 5 * 60;     // 05:00
const SERVICE_END_MIN   = 22 * 60;    // 22:00
const APPROACH_WINDOW_MIN = 20;       // show the bus "approaching" within N minutes
const BUS_SPEED_KMH = 20;             // fallback speed when no dataset per-stop times

function haversineKm(a, b) {
  const R = 6371, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
// Cumulative seconds to reach each route stop — REAL relative timing (per-stop
// distance/dataset times), then scaled so the pickup→destination ride equals the
// journey card's duration (keeps screens consistent; spacing stays realistic).
const stopSecs = computed(() => {
  const s = routeStops.value;
  if (s.length < 2) return [0];
  const est = s.map(x => x.estimated_minutes_from_start);
  const monotonic = est.every((v, i) => v != null && (i === 0 || v >= est[i-1]));
  let raw;
  if (monotonic) {
    raw = est.map(v => Number(v) * 60);
  } else {
    raw = [0];
    for (let i = 1; i < s.length; i++) {
      const d = haversineKm(
        { lat: +s[i-1].latitude, lng: +s[i-1].longitude },
        { lat: +s[i].latitude,   lng: +s[i].longitude });
      raw.push(raw[i-1] + Math.max(25, (d / BUS_SPEED_KMH) * 3600)); // ≥25s/segment
    }
  }
  // Scale so (dest − pickup) matches the card's ride duration.
  const pi = pickupIdx.value, di = destIdx.value;
  const dur = journey.value?.summary?.durationMinutes;
  if (pi >= 0 && di > pi && dur && raw[di] > raw[pi]) {
    const factor = (dur * 60) / (raw[di] - raw[pi]);
    raw = raw.map(v => v * factor);
  }
  return raw;
});
const tAt = (idx) => {
  const t = stopSecs.value;
  if (!t.length) return 0;
  return t[Math.max(0, Math.min(t.length - 1, idx))] || 0;
};

// Resolve the pickup-departure time to an absolute timestamp (today, or the next
// service day if it has already passed).
const departureMs = computed(() => {
  const dep = journey.value?.summary?.departureTime;
  if (!dep) return now.value;
  const [h, m] = dep.split(':').map(Number);
  let ms = new Date(now.value).setHours(h, m, 0, 0);
  if (ms < now.value - 6 * 3600 * 1000) ms += 24 * 3600 * 1000; // already passed → next day
  return ms;
});
// The bus leaves the route ORIGIN this many seconds before reaching your pickup.
const originDepartMs = computed(() => departureMs.value - tAt(pickupIdx.value) * 1000);
// Seconds since the bus left the origin (negative ⇒ hasn't started its run yet).
const busSimSec = computed(() => (now.value - originDepartMs.value) / 1000);

// Fractional bus position (absolute stop index) from real elapsed time.
const busIdxFloat = computed(() => {
  const t = stopSecs.value, x = busSimSec.value;
  if (t.length < 2) return 0;
  if (x <= t[0]) return 0;
  if (x >= t[t.length-1]) return t.length - 1;
  let i = 0; while (i < t.length - 1 && t[i+1] <= x) i++;
  const span = (t[i+1] - t[i]) || 1;
  return i + (x - t[i]) / span;
});
const busAbsIdx = computed(() => Math.round(busIdxFloat.value));

const nowMinOfDay = computed(() => { const d = new Date(now.value); return d.getHours() * 60 + d.getMinutes(); });
const inService   = computed(() => nowMinOfDay.value >= SERVICE_START_MIN && nowMinOfDay.value <= SERVICE_END_MIN);
const minsToDeparture = computed(() => Math.max(0, Math.round((departureMs.value - now.value) / 60000)));
const rideTotalSec    = computed(() => Math.max(60, tAt(destIdx.value) - tAt(pickupIdx.value)));
const minsToDest      = computed(() => Math.max(0, Math.ceil((departureMs.value + rideTotalSec.value * 1000 - now.value) / 60000)));

// Phase: waiting | approaching | riding | arrived (all from the real clock).
const phase = computed(() => {
  const toDep = (departureMs.value - now.value) / 60000;
  if (toDep <= 0) {
    if (now.value >= departureMs.value + rideTotalSec.value * 1000) return 'arrived';
    return inService.value ? 'riding' : 'arrived';
  }
  if (inService.value && toDep <= APPROACH_WINDOW_MIN) return 'approaching';
  return 'waiting';
});
const hasDeparted = computed(() => phase.value === 'riding' || phase.value === 'arrived');
const arrived     = computed(() => phase.value === 'arrived');
const approaching = computed(() => phase.value === 'approaching');

const stopsToPickup = computed(() => Math.max(0, pickupIdx.value - busAbsIdx.value));
const stopsToDest   = computed(() => Math.max(0, destIdx.value   - busAbsIdx.value));
const stopsLeft     = stopsToDest;   // used by the get-off alert
// Where to draw the bus in the list; pinned at start while waiting.
const currentSegIdx = computed(() => phase.value === 'waiting'
  ? -1
  : Math.max(0, Math.min(segmentList.value.length - 1, busAbsIdx.value - approachStart.value)));

// Per-row state + tag for the stop list.
function rowState(i) {
  if (i === destRow.value)   return 'dest';
  if (i === pickupRow.value && !hasDeparted.value) return 'pickup';
  if (currentSegIdx.value >= 0 && i === currentSegIdx.value) return 'current';
  if (currentSegIdx.value >= 0 && i <  currentSegIdx.value) return 'passed';
  return 'upcoming';
}
function rowTag(i) {
  switch (rowState(i)) {
    case 'current': return 'Bus is here';
    case 'pickup':  return 'Your pickup';
    case 'dest':    return 'Your stop';
    case 'passed':  return 'Passed';
    default:
      if (phase.value === 'waiting' || currentSegIdx.value < 0) return '';
      { const a = i - currentSegIdx.value; return a > 0 ? `${a} stop${a > 1 ? 's' : ''} away` : ''; }
  }
}

// Stat cards adapt to phase.
const stat1 = computed(() => {
  if (phase.value === 'arrived') return { label: 'Get off in', value: 0, unit: 'min' };
  if (phase.value === 'riding')  return { label: 'Get off in', value: minsToDest.value, unit: 'min' };
  return { label: approaching.value ? 'Bus in' : 'Departs in', value: minsToDeparture.value, unit: 'min' };
});
const stat2 = computed(() => hasDeparted.value
  ? { label: 'Stops left', value: stopsToDest.value }
  : { label: 'Stops away', value: approaching.value ? stopsToPickup.value : Math.max(0, pickupIdx.value - approachStart.value) });

const status = computed(() => {
  if (phase.value === 'arrived')     return { key: 'ok',   label: 'Arrived' };
  if (phase.value === 'waiting')     return { key: 'wait', label: 'Waiting' };
  if (phase.value === 'approaching') return { key: 'wait', label: 'Approaching' };
  const d = liveBus.value?.delayStatus || journey.value?.summary?.delayStatus || 'on_time';
  if (d === 'minor_delay') return { key: 'minor', label: 'Slight delay' };
  if (d === 'major_delay' || d === 'critical_delay') return { key: 'major', label: 'Delayed' };
  return { key: 'ok', label: 'On time' };
});

const phaseLabel = computed(() => {
  const pk = fmtStop(journey.value?.fromStop?.name);
  const dt = journey.value?.summary?.departureTime || '05:00';
  if (phase.value === 'arrived')     return `Arrived at ${fmtStop(journey.value?.toStop?.name)}`;
  if (phase.value === 'riding')      return `On board — ${stopsToDest.value} stop${stopsToDest.value === 1 ? '' : 's'} to your stop`;
  if (phase.value === 'approaching') return `Bus approaching ${pk} · ${stopsToPickup.value} stop${stopsToPickup.value === 1 ? '' : 's'} away`;
  if (!inService.value)              return `Buses run 05:00–22:00 · next departure ${dt}`;
  return `Waiting — bus departs ${dt} · in ${minsToDeparture.value} min`;
});

// Bus position along the REAL polyline — hidden while waiting (no bus running).
const busLatLng = computed(() => {
  if (phase.value === 'waiting') return null;
  const path = routePath.value;
  const n = routeStops.value.length;
  if (!path || path.length < 2 || n < 2) return null;
  const frac = Math.min(1, Math.max(0, busIdxFloat.value / (n - 1)));
  const fpos = frac * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(fpos));
  const t = fpos - i;
  const a = path[i], b = path[i + 1];
  return [a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t]; // [lat, lng]
});

// Auto-scroll the stop list so the bus's current stop stays in view.
const listRef = ref(null);
watch(currentSegIdx, () => {
  nextTick(() => {
    try { listRef.value?.querySelector('.stl-row.current')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ }
  });
});

// ── Map ──
let map = null, busMarker = null, userMarker = null, L = null;
let busAnim = null;
function glideBus(toLat, toLng) {
  if (!busMarker) return;
  const from = busMarker.getLatLng();
  if (busAnim) clearInterval(busAnim);
  let step = 0; const steps = 16;
  busAnim = setInterval(() => {
    step++;
    const t = step / steps;
    busMarker.setLatLng([from.lat + (toLat - from.lat) * t, from.lng + (toLng - from.lng) * t]);
    if (step >= steps) { clearInterval(busAnim); busAnim = null; }
  }, 60);
}

async function initMap() {
  L = await import('leaflet');
  const el = document.getElementById('nav-map');
  if (!el) return;
  let center = journey.value?.fromStop?.lat ? [journey.value.fromStop.lat, journey.value.fromStop.lng] : [-1.9441, 30.0619];
  map = L.map('nav-map', { zoomControl: false, attributionControl: false }).setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  if (routePath.value.length >= 2) {
    const pl = L.polyline(routePath.value.map(c => [c[1], c[0]]), { color: journey.value.routeColor || '#0EA5A3', weight: 5, opacity: 0.85 }).addTo(map);
    map.fitBounds(pl.getBounds(), { padding: [40, 40] });
  }
  // Destination marker
  if (journey.value?.toStop?.lat) {
    L.marker([journey.value.toStop.lat, journey.value.toStop.lng], {
      icon: L.divIcon({ className: '', html: `<div style="background:#EF4444;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #EF4444"></div>`, iconAnchor: [8, 8] }),
    }).addTo(map);
  }
  updateMarkers();
}

function updateMarkers() {
  if (!map || !L) return;
  // Bus follows the real-time position along the route. Hidden while waiting
  // (no bus is running outside service hours / before departure).
  const pos = busLatLng.value;
  if (pos) {
    if (busMarker) glideBus(pos[0], pos[1]);
    else busMarker = L.marker(pos, { icon: L.divIcon({ className: '', html: `<div class="nav-bus-dot">🚌</div>`, iconAnchor: [16, 16] }) }).addTo(map);
  } else if (busMarker) {
    map.removeLayer(busMarker); busMarker = null;
  }
  if (userPos.value) {
    if (userMarker) userMarker.setLatLng([userPos.value.lat, userPos.value.lng]);
    else userMarker = L.marker([userPos.value.lat, userPos.value.lng], { icon: L.divIcon({ className: '', html: `<div class="nav-user-dot"></div>`, iconAnchor: [10, 10] }) }).addTo(map);
  }
}

function evaluateAlert() {
  // Only alert once the ride is underway (bus has departed your pickup stop).
  if (hasDeparted.value && stopsLeft.value != null && stopsLeft.value <= 1 && !alertFired.value) {
    alertFired.value = true;
    getOffAlert.value = true;
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch { /* */ }
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('MoveXa — Get off soon', { body: `${fmtStop(journey.value?.toStop?.name)} is the next stop` }); } catch { /* */ }
    setTimeout(() => { getOffAlert.value = false; }, 12000);
  }
}

let clockTimer = null, busTimer = null, geoWatch = null;

async function loadRoute() {
  if (!journey.value?.routeId) return;
  const [s, p] = await Promise.all([
    routesApi.getStops(journey.value.routeId).catch(() => ({ data: [] })),
    routesApi.getPath(journey.value.routeId).catch(() => ({ data: { coordinates: [] } })),
  ]);
  routeStops.value = s.data || [];
  routePath.value  = p.data?.coordinates || [];
}

function exit() { router.back(); }

onMounted(async () => {
  if (!journey.value) return;
  try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission(); } catch { /* */ }
  await loadRoute();
  await vehicleStore.fetchLive(journey.value.routeId);
  await nextTick();
  await initMap();
  // Real-clock tick — everything (position, countdowns, phase) derives from the
  // actual time, so the bus moves in real minutes and respects service hours.
  clockTimer = setInterval(() => {
    now.value = Date.now();
    updateMarkers();
    evaluateAlert();
  }, 1000);
  // Slow live refresh — keeps the delay/status fed from real vehicle data.
  busTimer = setInterval(() => { vehicleStore.fetchLive(journey.value.routeId); }, 8000);
  if ('geolocation' in navigator) {
    geoWatch = navigator.geolocation.watchPosition(
      pos => { userPos.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }; updateMarkers(); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 });
  }
  evaluateAlert();
});

onUnmounted(() => {
  clearInterval(clockTimer); clearInterval(busTimer);
  if (busAnim) clearInterval(busAnim);
  if (geoWatch != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(geoWatch);
  map?.remove(); map = null;
});
</script>

<style scoped>
.navigate { display: flex; flex-direction: column; height: 100vh; background: #0F172A; color: #fff; }

.nav-top { display: flex; align-items: center; gap: 12px; padding: 14px 16px 8px; }
.nav-back { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #1E293B; color: #fff; flex-shrink: 0; }
.nav-back svg { width: 18px; height: 18px; }
.nav-trip { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nav-line { padding: 3px 9px; border-radius: 7px; font-weight: 800; font-size: 12px; color: #fff; flex-shrink: 0; }
.nav-trip-txt { font-size: 13px; color: #CBD5E1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.nav-stats { display: flex; gap: 10px; padding: 4px 16px 12px; }
.nav-stat { flex: 1; background: #1E293B; border-radius: 16px; padding: 12px 10px; text-align: center; }
.nav-stat-label { display: block; font-size: 11px; color: #94A3B8; margin-bottom: 4px; }
.nav-stat-value { font-size: 26px; font-weight: 900; font-family: var(--font-heading); }
.nav-stat-value small { font-size: 13px; font-weight: 600; color: #94A3B8; margin-left: 2px; }
.nav-stat-value--dot { display: inline-flex; align-items: center; gap: 6px; }
.nav-stop-dot { width: 10px; height: 10px; border-radius: 50%; }
.nav-stat-status { font-size: 18px; }
.status-ok { color: #4ADE80; }
.status-minor { color: #FBBF24; }
.status-major, .status-critical { color: #F87171; }
.status-wait { color: #60A5FA; }

.nav-phase {
  display: flex; align-items: center; gap: 8px;
  margin: 0 16px 10px; padding: 8px 14px; border-radius: 12px;
  font-size: 13px; font-weight: 700;
}
.nav-phase.waiting { background: rgba(59,130,246,0.15); color: #93C5FD; }
.nav-phase.enroute { background: rgba(74,222,128,0.15); color: #86EFAC; }
.nav-phase-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: navPulse 1.3s ease infinite; }

.nav-body { flex: 1; position: relative; display: flex; min-height: 0; }
.nav-map { position: absolute; inset: 0; width: 100%; height: 100%; }
.nav-timeline {
  position: absolute; top: 0; right: 0; bottom: 0; width: 188px;
  background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(4px);
  display: flex; flex-direction: column;
  z-index: 1000; /* above Leaflet map panes */
}
.ntl-head { display: flex; align-items: baseline; gap: 6px; padding: 12px 14px 8px; border-bottom: 1px solid #1E293B; }
.ntl-head-count { font-size: 24px; font-weight: 900; font-family: var(--font-heading); color: #fff; }
.ntl-head-label { font-size: 11px; color: #94A3B8; font-weight: 600; }
.ntl-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }

.stl-row { display: flex; gap: 10px; opacity: 0.55; transition: opacity 0.3s; }
.stl-row.current, .stl-row.dest, .stl-row.board { opacity: 1; }
.stl-row.passed { opacity: 0.4; }
.stl-marker { display: flex; flex-direction: column; align-items: center; }
.stl-dot {
  width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
  border: 2px solid #475569; background: #0F172A;
  display: flex; align-items: center; justify-content: center; font-size: 11px;
}
.stl-row.current .stl-dot { border-width: 0; background: transparent; width: 22px; height: 22px; }
.stl-bus { font-size: 18px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); animation: navPulse 1.2s ease infinite; }
.stl-check { color: #4ADE80; font-weight: 900; font-size: 12px; }
.stl-line { width: 2px; flex: 1; min-height: 16px; background: #334155; margin: 2px 0; }
.stl-line.done { background: #4ADE80; }
.stl-body { flex: 1; min-width: 0; padding-bottom: 12px; }
.stl-name { font-size: 13px; font-weight: 700; color: #E2E8F0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stl-row.current .stl-name { color: #fff; }
.stl-row.dest .stl-name { color: #FCA5A5; }
.stl-row.pickup .stl-name { color: #5EEAD4; }
.stl-row.pickup, .stl-row.dest, .stl-row.current { opacity: 1; }
.stl-dot.pickup { border-color: #2DD4BF !important; box-shadow: 0 0 0 3px rgba(45,212,191,0.25); }
.stl-dot.dest { border-color: #EF4444 !important; }
.stl-tag { font-size: 10px; color: #94A3B8; margin-top: 1px; }
.stl-row.current .stl-tag { color: #60A5FA; font-weight: 700; }
.stl-row.pickup .stl-tag { color: #5EEAD4; font-weight: 700; }

.getoff-alert {
  position: fixed; left: 16px; right: 16px; bottom: 24px; z-index: 1000;
  display: flex; align-items: center; gap: 12px; padding: 16px;
  background: #F59E0B; color: #1F2937; border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,0.35); cursor: pointer;
}
.getoff-icon { font-size: 28px; animation: navPulse 1s ease infinite; }
.getoff-title { font-weight: 800; font-size: 15px; }
.getoff-sub { font-size: 13px; }
@keyframes navPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.5;transform:scale(1.25);} }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }

.nav-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; background: #0F172A; }
</style>
<style>
.nav-bus-dot { font-size: 22px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5)); }
.nav-user-dot { width: 18px; height: 18px; border-radius: 50%; background: #3B82F6; border: 3px solid #fff; box-shadow: 0 0 0 4px rgba(59,130,246,0.35); }
</style>
