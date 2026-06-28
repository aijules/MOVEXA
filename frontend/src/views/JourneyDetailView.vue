<template>
  <div class="page journey-detail">
    <!-- Back + save -->
    <div class="detail-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div class="dh-title">
        <p class="text-muted" style="font-size:12px">{{ journey?.routeCode }} · {{ journey?.routeName }}</p>
        <h2>Journey Detail</h2>
      </div>
      <button class="save-btn" @click="saveJourney" :class="{ saved: isSaved }" :title="isSaved ? 'Saved' : 'Save journey'">
        <svg viewBox="0 0 24 24" fill="none" :stroke="isSaved ? 'none' : 'currentColor'" stroke-width="2.2" :fill="isSaved ? 'var(--color-primary)' : 'none'"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
      </button>
    </div>

    <div v-if="!journey" class="empty-state">
      <p>Journey not found.</p>
      <button class="btn btn-outline" @click="router.push('/planner')" style="margin-top:16px">Plan journey</button>
    </div>

    <template v-else>
      <!-- ── ETA countdown card ── -->
      <div class="eta-hero card" :class="[`eta-hero--${currentDelayStatus}`, busStatus !== 'arriving' ? 'eta-hero--status' : '']">
        <div class="eta-hero-left">
          <!-- Arriving: show countdown -->
          <template v-if="busStatus === 'arriving'">
            <p class="eta-label">Bus arrives at pickup</p>
            <div class="eta-countdown">
              <span class="eta-number">{{ etaMinutes }}</span>
              <span class="eta-unit">min</span>
              <span v-if="etaSeconds > 0" class="eta-seconds">{{ etaSeconds }}s</span>
            </div>
          </template>
          <!-- Departing now -->
          <template v-else-if="busStatus === 'departing_now'">
            <p class="eta-label">Bus is at your stop</p>
            <div class="eta-countdown"><span class="eta-status-text">Departing now</span></div>
          </template>
          <!-- Departed -->
          <template v-else>
            <p class="eta-label">Bus departed — check next bus</p>
            <div class="eta-countdown"><span class="eta-status-text eta-status-departed">Departed</span></div>
          </template>
          <div class="eta-badge" :class="busStatus === 'arriving' ? `eta-badge--${currentDelayStatus}` : 'eta-badge--status'">
            <span class="eta-dot eta-badge--pulse"></span>
            <span v-if="busStatus === 'arriving'">
              {{ delayLabel(currentDelayStatus, currentDelayMins) }}
              <span v-if="currentDelayMins > 0">+{{ currentDelayMins }}min</span>
            </span>
            <span v-else-if="busStatus === 'departing_now'">Board now — doors closing</span>
            <span v-else>Next bus available from results</span>
          </div>
          <!-- currentStop from live bus -->
          <p v-if="liveBus?.currentStop?.name" class="eta-current-stop text-muted">
            🚌 Currently at: {{ liveBus.currentStop.name }}
          </p>
        </div>
        <div class="eta-hero-right">
          <div class="eta-route-dot" :style="{ background: journey.routeColor }">
            <span class="eta-route-num">{{ journey.routeCode }}</span>
          </div>
          <p class="eta-adaptive text-muted">{{ currentAdaptiveMsg }}</p>
        </div>
      </div>

      <!-- ── Guided journey CTA ── -->
      <div class="guide-start">
        <button class="btn btn-primary btn-full" @click="goNavigate">
          🧭 Navigate — guide me live
        </button>
        <p class="guide-hint text-muted">Live map · stops-left counter · get-off alert</p>
      </div>

      <!-- ── Times summary ── -->
      <div class="times-card card">
        <div class="times-row">
          <div class="time-col">
            <p class="tc-label">Depart</p>
            <p class="tc-time">{{ journey.summary?.departureTime }}</p>
            <p class="tc-stop text-muted">{{ fmtStop(journey.fromStop?.name) }}</p>
          </div>
          <div class="time-mid">
            <span class="time-dur-pill">{{ journey.summary?.durationMinutes }}min</span>
            <div class="time-line" :style="{ background: journey.routeColor }"></div>
          </div>
          <div class="time-col time-col--right">
            <p class="tc-label">Arrive</p>
            <p class="tc-time">{{ journey.summary?.arrivalTime }}</p>
            <p class="tc-stop text-muted">{{ fmtStop(journey.toStop?.name) }}</p>
          </div>
        </div>
        <div class="times-meta">
          <span>{{ journey.summary?.numberOfStops }} stops</span>
          <span>{{ journey.summary?.fareEstimate?.amount }} {{ journey.summary?.fareEstimate?.currency }}</span>
          <span v-if="journey.type === 'transfer'">1 transfer</span>
        </div>
      </div>

      <!-- ── Map preview ── -->
      <div class="map-preview-card card">
        <div class="mp-header">
          <p class="mp-title">Live Map</p>
          <router-link to="/map" class="mp-expand">Full map →</router-link>
        </div>
        <div id="detail-map" class="detail-map"></div>
        <div class="mp-bus-count" v-if="busCount > 0">
          <span class="live-dot"></span> {{ busCount }} active bus{{ busCount !== 1 ? 'es' : '' }} on route
        </div>
      </div>

      <!-- ── Journey steps (walk + ride + transfer legs) ── -->
      <div v-if="journey.legs?.length > 1 || journey.type === 'transfer'" class="legs-card card">
        <p class="section-title">Journey Steps</p>
        <div v-for="(leg, i) in journey.legs" :key="i" class="leg-row">
          <template v-if="leg.type === 'ride'">
            <div class="leg-icon">🚌</div>
            <div class="leg-content">
              <p class="leg-route">{{ leg.routeCode }} — {{ leg.headsign }}</p>
              <p class="leg-stops text-muted">{{ fmtStop(leg.fromStop) }} → {{ fmtStop(leg.toStop) }}</p>
              <p class="leg-time text-muted">{{ leg.departureTime }} – {{ leg.arrivalTime }} · {{ leg.durationMinutes }} min</p>
            </div>
          </template>
          <template v-else-if="leg.type === 'walk'">
            <div class="leg-icon">🚶</div>
            <div class="leg-content">
              <p class="leg-route">Walk {{ leg.distanceMeters ? Math.round(leg.distanceMeters) + ' m' : '' }}</p>
              <p class="leg-stops text-muted">{{ leg.from || fmtStop(leg.fromStop) }} → {{ leg.to || fmtStop(leg.toStop) }}</p>
              <p class="leg-time text-muted">~{{ leg.walkMinutes }} min on foot</p>
            </div>
          </template>
          <template v-else-if="leg.type === 'transfer'">
            <div class="leg-icon">🚶</div>
            <div class="leg-content">
              <p class="leg-route">Transfer at {{ fmtStop(leg.stopName) }}</p>
              <p class="leg-time text-muted">Walk to connecting bus · wait ~{{ leg.waitMinutes }} min</p>
            </div>
          </template>
        </div>
      </div>

      <!-- ── Live stop timeline ── -->
      <div class="stops-card card">
        <div class="stops-head">
          <p class="section-title" style="margin:0">Journey Stops</p>
          <span class="stops-live" :class="`live-${livePhase}`">
            <span v-if="livePhase==='riding'||livePhase==='approaching'" class="stops-live-dot"></span>
            {{ stopsPhaseLabel }}
          </span>
        </div>
        <div class="stop-timeline" v-if="routeStops.length">
          <div v-for="(stop, i) in routeStops" :key="stop.id || i" class="stop-tl-row" :class="`st-${stopStatus(i)}`">
            <div class="stop-tl-dot-col">
              <div class="stop-tl-dot"
                :class="{
                  'stop-tl-dot--active':  stopStatus(i)==='pickup',
                  'stop-tl-dot--dest':    stopStatus(i)==='dest',
                  'stop-tl-dot--current': stopStatus(i)==='current',
                  'stop-tl-dot--passed':  stopStatus(i)==='passed',
                }"
              ><span v-if="stopStatus(i)==='current'" class="stop-tl-bus">🚌</span></div>
              <div v-if="i < routeStops.length - 1" class="stop-tl-line" :class="{ done: livePhase!=='waiting' && i < liveBusIdx }" :style="{ background: i >= pickupIdx && i < destIdx ? journey.routeColor : undefined }"></div>
            </div>
            <div class="stop-tl-content">
              <span class="stop-tl-name" :class="{ 'text-primary': stopStatus(i)==='pickup', 'text-danger': stopStatus(i)==='dest', 'stop-tl-name--current': stopStatus(i)==='current' }">
                {{ fmtStop(stop.stop_name || stop.name) }}
              </span>
              <span v-if="stopStatus(i)==='current'" class="stop-tl-here">Bus here</span>
              <span v-else-if="stop.estimated_minutes_from_start" class="stop-tl-time">+{{ stop.estimated_minutes_from_start }}min</span>
            </div>
          </div>
        </div>
        <div v-else class="text-muted" style="font-size:13px;padding:8px 0">Loading stops…</div>
      </div>

      <!-- ── Bus info ── -->
      <div v-if="liveBus" class="bus-info-card card">
        <p class="section-title">Assigned Bus</p>
        <div class="bus-info-row">
          <div class="bus-icon-wrap">🚌</div>
          <div class="bus-info-text">
            <p class="bus-plate">{{ liveBus.plateNumber || liveBus.plate }}</p>
            <p class="text-muted" style="font-size:12px">{{ liveBus.routeCode }} · {{ Math.round(liveBus.speedKph || 0) }} km/h</p>
          </div>
          <div class="bus-progress-col">
            <p class="text-muted" style="font-size:11px;margin-bottom:4px">Progress {{ Math.round(liveBus.progressPercentage || 0) }}%</p>
            <div class="progress-bar"><div class="progress-bar__fill" :style="{ width: `${liveBus.progressPercentage || 0}%` }"></div></div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useJourneyStore }   from '../stores/journeyStore';
import { useVehicleStore }   from '../stores/vehicleStore';
import { savedJourneysApi, routesApi } from '../services/api';
import { useBusProgress, isInServiceNow } from '../composables/useBusProgress';

const router       = useRouter();
const journeyStore = useJourneyStore();
const vehicleStore = useVehicleStore();

const journey = computed(() => journeyStore.selectedJourney);

// ── Countdown + bus status state ──
const etaMinutes   = ref(0);
const etaSeconds   = ref(0);
const busStatus    = ref('arriving'); // 'arriving' | 'departing_now' | 'departed'
const currentDelayStatus = ref('on_time');
const currentDelayMins   = ref(0);
const currentAdaptiveMsg = ref('On time');

// ── Route data ──
const routeStops = ref([]);
const routePath  = ref([]);
const busCount   = ref(0);

// ── Live, service-aware bus progress (shared with Navigate + Live Map) ──
const liveNow = ref(Date.now());
const bp = useBusProgress({ journey, routeStops, routePath, now: liveNow });
const stopStatus = bp.stopStatus;
const livePhase  = bp.phase;
const liveBusIdx = bp.busAbsIdx;
const stopsPhaseLabel = computed(() => {
  const pk = fmtStop(journey.value?.fromStop?.name);
  const dt = journey.value?.summary?.departureTime || '05:00';
  switch (livePhase.value) {
    case 'arrived':     return 'Trip complete';
    case 'riding':      return `On board · ${bp.stopsToDest.value} stop${bp.stopsToDest.value === 1 ? '' : 's'} to go`;
    case 'approaching': return `Bus approaching ${pk} · ${bp.stopsToPickup.value} away`;
    default:            return bp.inService.value ? `Departs ${dt} · in ${bp.minsToDeparture.value} min` : `Runs 05:00–22:00 · next ${dt}`;
  }
});

// ── Saved state ──
const isSaved = ref(false);

// ── Guided journey state ──
const guiding      = ref(false);
const getOffAlert  = ref(false);
const alertFired   = ref(false);

// Index of the route stop the live bus is currently at (matched by name).
const busStopIdx = computed(() => {
  const cur = liveBus.value?.currentStop?.name;
  if (!cur || !routeStops.value.length) return -1;
  const norm = s => String(s || '').toLowerCase().trim();
  return routeStops.value.findIndex(s => norm(s.stop_name || s.name) === norm(cur));
});

// How many stops until the passenger's destination.
const stopsToDest = computed(() => {
  if (busStopIdx.value < 0 || destIdx.value < 0) return null;
  return destIdx.value - busStopIdx.value;
});

const guideProgressPct = computed(() => {
  if (pickupIdx.value < 0 || destIdx.value <= pickupIdx.value || busStopIdx.value < 0) {
    return Math.min(95, Math.round(liveBus.value?.progressPercentage || 0));
  }
  const span = destIdx.value - pickupIdx.value;
  const done = Math.min(span, Math.max(0, busStopIdx.value - pickupIdx.value));
  return Math.round((done / span) * 100);
});

const guidePhase = computed(() => {
  if (stopsToDest.value == null) return 'enroute';
  if (stopsToDest.value <= 0) return 'arrived';
  if (stopsToDest.value <= 1) return 'getoff';
  return 'enroute';
});

const guideHeadline = computed(() => {
  if (stopsToDest.value == null) return 'On the way to your stop';
  if (stopsToDest.value <= 0)    return `You've reached ${fmtStop(journey.value?.toStop?.name)}`;
  if (stopsToDest.value === 1)   return 'Next stop is yours — get ready!';
  return `${stopsToDest.value} stops to ${fmtStop(journey.value?.toStop?.name)}`;
});

const guideSub = computed(() => {
  if (liveBus.value?.currentStop?.name) return `Bus now at ${fmtStop(liveBus.value.currentStop.name)}`;
  return 'Tracking your bus live…';
});

function startGuidance() {
  guiding.value = true;
  alertFired.value = false;
  // Ask for notification permission so we can alert even if the tab is backgrounded.
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch { /* ignore */ }
  evaluateGuidance();
}
function stopGuidance() {
  guiding.value = false;
  getOffAlert.value = false;
}

// Fire the in-app "get off" alert once when the bus is one stop away.
function evaluateGuidance() {
  if (!guiding.value) return;
  if (stopsToDest.value != null && stopsToDest.value <= 1 && stopsToDest.value >= 0 && !alertFired.value) {
    alertFired.value = true;
    getOffAlert.value = true;
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch { /* unsupported */ }
    // Browser notification if the user has granted permission.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('MoveXa — Get off soon', { body: `${fmtStop(journey.value?.toStop?.name)} is the next stop` });
      }
    } catch { /* ignore */ }
    setTimeout(() => { getOffAlert.value = false; }, 12000);
  }
}

// Never fall back to a random bus — only show a bus that matches THIS route
const liveBus = computed(() => {
  if (!journey.value) return null;
  return vehicleStore.liveVehicles.find(v =>
    v.routeId === journey.value.routeId || v.routeCode === journey.value.routeCode
  ) || null;
});

// Inline haversine so ETA can be recalculated from live bus position
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const pickupIdx = computed(() => {
  if (!journey.value?.fromStop) return 0;
  return routeStops.value.findIndex(s => s.id === journey.value.fromStop.id);
});
const destIdx = computed(() => {
  if (!journey.value?.toStop) return routeStops.value.length - 1;
  return routeStops.value.findIndex(s => s.id === journey.value.toStop.id);
});

function isPickupStop(stop) { return stop.id === journey.value?.fromStop?.id; }
function isDestStop(stop)   { return stop.id === journey.value?.toStop?.id; }

function fmtStop(name = '') {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  return isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
}

function delayLabel(status, mins) {
  if (!status || status === 'on_time') return 'On time';
  if (status === 'minor_delay') return 'Minor delay';
  if (status === 'major_delay') return 'Major delay';
  return 'Critical delay';
}

// ── Countdown timer ──
let countdownTimer = null;
let refreshTimer   = null;
let etaEndTime     = null;

function initCountdown() {
  const j = journey.value;
  if (!j) return;
  busStatus.value = 'arriving';
  // Compute end time from departure time (most accurate anchor)
  let etaMins = j.summary?.etaToPickupMinutes;
  if (j.summary?.departureTime) {
    const [h, m] = j.summary.departureTime.split(':').map(Number);
    const depMs  = new Date().setHours(h, m, 0, 0);
    const fromDep = Math.round((depMs - Date.now()) / 60000);
    if (fromDep >= 0 || etaMins == null) etaMins = Math.max(0, fromDep);
  }
  etaEndTime = Date.now() + (etaMins || 0) * 60000;
  currentDelayStatus.value = j.summary?.delayStatus    || 'on_time';
  currentDelayMins.value   = j.summary?.delayMinutes   || 0;
  currentAdaptiveMsg.value = j.summary?.adaptiveMessage || 'On time';
  adaptiveAddedMins = 0;   // reset the 7-min adaptive cap for this journey
  tickCountdown();
}

function tickCountdown() {
  const remaining = Math.max(0, etaEndTime - Date.now());
  etaMinutes.value = Math.floor(remaining / 60000);
  etaSeconds.value = Math.floor((remaining % 60000) / 1000);
  // State machine: never reset to 60s — progress forward only
  if (busStatus.value === 'arriving' && remaining <= 0) {
    busStatus.value = 'departing_now';
  }
}

// ── Adaptive scheduling (live ETA re-estimation) ──
// Like Jakdojade: the ETA isn't fixed — traffic/incidents can push it UP, then
// it recovers. This nudges the live countdown and shows the reason.
let adaptiveTimer = null;
let adaptiveAddedMins = 0;          // cumulative traffic delay added (capped)
const MAX_ADAPTIVE_ADD = 7;          // traffic can add at most 7 min total
const TRAFFIC_REASONS = [
  'Traffic build-up ahead', 'Congestion near junction', 'Roadworks slowing traffic',
  'Heavy passenger boarding', 'Signal delay on corridor',
];
function delayKey(mins) {
  return mins >= 8 ? 'major_delay' : mins >= 3 ? 'minor_delay' : 'on_time';
}
function applyAdaptive() {
  if (busStatus.value !== 'arriving') return;
  const r = Math.random();
  const room = MAX_ADAPTIVE_ADD - adaptiveAddedMins;   // how much traffic delay is still allowed
  if (r < 0.30 && room > 0) {
    // Traffic — ETA increases, but never beyond the 7-minute cap.
    const add = Math.min(1 + Math.floor(Math.random() * 2), room); // +1..2, clamped to remaining room
    adaptiveAddedMins += add;
    etaEndTime += add * 60000;
    currentDelayMins.value += add;
    currentDelayStatus.value = delayKey(currentDelayMins.value);
    currentAdaptiveMsg.value = `🚦 ${TRAFFIC_REASONS[Math.floor(Math.random() * TRAFFIC_REASONS.length)]} — ETA +${add} min`;
    tickCountdown();
  } else if (r < 0.45 && currentDelayMins.value > 0) {
    // Recovery — bus makes up some time
    const back = 1;
    adaptiveAddedMins = Math.max(0, adaptiveAddedMins - back);
    etaEndTime = Math.max(Date.now(), etaEndTime - back * 60000);
    currentDelayMins.value = Math.max(0, currentDelayMins.value - back);
    currentDelayStatus.value = delayKey(currentDelayMins.value);
    currentAdaptiveMsg.value = currentDelayMins.value === 0 ? 'Back on schedule' : 'Recovering time — traffic easing';
    tickCountdown();
  }
}

// ── Map ──
let map = null;
let busMarkers = {};
const prevBusPositions = {}; // busId → [lat, lng] for smooth animation

function animateMarker(marker, fromLat, fromLng, toLat, toLng, steps = 20) {
  let step = 0;
  const id = setInterval(() => {
    step++;
    const t = step / steps;
    marker.setLatLng([fromLat + (toLat - fromLat) * t, fromLng + (toLng - fromLng) * t]);
    if (step >= steps) clearInterval(id);
  }, 50); // 20 steps × 50ms = 1s animation
}
let routePolyline = null;

async function initMap() {
  if (!journey.value) return;
  const L = await import('leaflet');

  const container = document.getElementById('detail-map');
  if (!container) return;

  // Default center: Kigali
  let center = [-1.9441, 30.0619];
  if (journey.value.fromStop?.lat) center = [journey.value.fromStop.lat, journey.value.fromStop.lng];

  map = L.map('detail-map', { zoomControl: false, attributionControl: false });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  // Draw route path
  if (routePath.value.length >= 2) {
    const latlngs = routePath.value.map(c => [c[1], c[0]]);
    routePolyline = L.polyline(latlngs, {
      color:   journey.value.routeColor || '#0EA5A3',
      weight:  5,
      opacity: 0.85,
    }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [28, 28] });
  } else {
    map.setView(center, 13);
  }

  // Pickup marker
  if (journey.value.fromStop?.lat) {
    const pickupIcon = L.divIcon({
      className: '',
      html: `<div style="background:#0EA5A3;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #0EA5A3;"></div>`,
      iconAnchor: [7, 7],
    });
    L.marker([journey.value.fromStop.lat, journey.value.fromStop.lng], { icon: pickupIcon })
      .addTo(map).bindPopup(`<b>Pickup:</b> ${fmtStop(journey.value.fromStop.name)}`);
  }

  // Destination marker
  if (journey.value.toStop?.lat) {
    const destIcon = L.divIcon({
      className: '',
      html: `<div style="background:#EF4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #EF4444;"></div>`,
      iconAnchor: [7, 7],
    });
    L.marker([journey.value.toStop.lat, journey.value.toStop.lng], { icon: destIcon })
      .addTo(map).bindPopup(`<b>Destination:</b> ${fmtStop(journey.value.toStop.name)}`);
  }

  // Stop markers
  for (const stop of routeStops.value) {
    if (!stop.latitude || !stop.longitude) continue;
    const icon = L.circleMarker([Number(stop.latitude), Number(stop.longitude)], {
      radius: 4, fillColor: journey.value.routeColor || '#0EA5A3',
      color: '#fff', weight: 2, fillOpacity: 1,
    }).addTo(map).bindPopup(fmtStop(stop.stop_name || stop.name));
  }

  updateBusMarkers(L);
}

function updateBusMarkers(L) {
  if (!map || !L) return;
  // Outside service hours (05:00–22:00) there are no buses on the road.
  if (!isInServiceNow()) {
    for (const id in busMarkers) { map.removeLayer(busMarkers[id]); delete busMarkers[id]; }
    busCount.value = 0;
    return;
  }
  const routeBuses = vehicleStore.liveVehicles.filter(v =>
    v.routeId === journey.value?.routeId || v.routeCode === journey.value?.routeCode
  );
  busCount.value = routeBuses.length || vehicleStore.liveVehicles.length;
  const toRender = routeBuses.length ? routeBuses : vehicleStore.liveVehicles.slice(0, 5);

  for (const v of toRender) {
    if (!v.lat || !v.lng) continue;
    const html = `<div class="bus-marker-wrap ${v.delayStatus === 'critical_delay' ? 'critical' : v.delayStatus?.includes('delay') ? 'delayed' : ''}">🚌 ${v.routeCode || ''}</div>`;
    const icon = L.divIcon({ className: '', html, iconAnchor: [28, 14] });
    const vid = String(v.id || v.busId);
    if (busMarkers[vid]) {
      const prev = prevBusPositions[vid];
      if (prev && (prev[0] !== v.lat || prev[1] !== v.lng)) {
        animateMarker(busMarkers[vid], prev[0], prev[1], v.lat, v.lng);
      } else {
        busMarkers[vid].setLatLng([v.lat, v.lng]);
      }
    } else {
      busMarkers[vid] = L.marker([v.lat, v.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${v.routeCode}</b><br>🚏 ${fmtStop(v.nextStop?.name || '–')}<br>⚡ ${Math.round(v.speedKph || 0)} km/h · ${Math.round(v.progressPercentage || 0)}%<br>${delayLabel(v.delayStatus)}`);
    }
    prevBusPositions[vid] = [v.lat, v.lng];
  }
}

async function loadRouteData() {
  if (!journey.value?.routeId) return;
  const [stopsRes, pathRes] = await Promise.all([
    routesApi.getStops(journey.value.routeId).catch(() => ({ data: [] })),
    routesApi.getPath(journey.value.routeId).catch(() => ({ data: { coordinates: [] } })),
  ]);
  routeStops.value = stopsRes.data || [];
  routePath.value  = pathRes.data?.coordinates || [];
}

async function refreshBuses() {
  await vehicleStore.fetchLive(journey.value?.routeId);
  if (map) {
    const L = await import('leaflet');
    updateBusMarkers(L);
  }
  // Sync delay from live bus, but DON'T erase an adaptive (traffic) delay —
  // take the larger so the simulated congestion isn't reset every 4s.
  if (liveBus.value) {
    const liveDelay = liveBus.value.delayMinutes || 0;
    if (liveDelay > currentDelayMins.value) {
      currentDelayMins.value   = liveDelay;
      currentDelayStatus.value = liveBus.value.delayStatus || 'on_time';
    }
    // Advance status: if bus has moved well past pickup stop, mark departed
    if (busStatus.value === 'departing_now' && (liveBus.value.progressPercentage || 0) > 35) {
      busStatus.value = 'departed';
    }
  }
  // Re-check guided-journey alerts against the freshly fetched bus position.
  evaluateGuidance();
}

function goNavigate() {
  router.push(`/navigate/${journey.value?.journeyId || '1'}`);
}

async function saveJourney() {
  if (!journey.value) return;
  isSaved.value = !isSaved.value;
  if (isSaved.value) {
    await savedJourneysApi.save({
      fromStopId:   journey.value.fromStop?.id,
      toStopId:     journey.value.toStop?.id,
      fromStopName: journey.value.fromStop?.name,
      toStopName:   journey.value.toStop?.name,
      routeId:      journey.value.routeId,
      journeyData:  journey.value,
    }).catch(() => {});
  }
}

onMounted(async () => {
  if (!journey.value) return;
  await loadRouteData();
  initCountdown();
  countdownTimer = setInterval(() => { liveNow.value = Date.now(); tickCountdown(); }, 1000);
  await vehicleStore.fetchLive(journey.value.routeId);
  await nextTick();
  await initMap();
  refreshTimer = setInterval(refreshBuses, 4000);
  adaptiveTimer = setInterval(applyAdaptive, 6000); // adaptive ETA re-estimation
});

onUnmounted(() => {
  clearInterval(countdownTimer);
  clearInterval(refreshTimer);
  clearInterval(adaptiveTimer);
  map?.remove();
  map = null;
});
</script>

<style scoped>
.journey-detail { background: var(--color-bg); }

.detail-header {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 16px 12px; background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); flex-shrink: 0; }
.back-btn svg { width: 20px; height: 20px; }
.dh-title { flex: 1; min-width: 0; }
h2 { font-size: 18px; }
.save-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); flex-shrink: 0; color: var(--color-muted); transition: color 0.18s, background 0.18s; }
.save-btn.saved { color: var(--color-primary); background: #F0FDFC; }
.save-btn svg { width: 20px; height: 20px; }

/* ── ETA Hero ── */
.eta-hero {
  margin: 14px 16px 10px; padding: 18px;
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border-left: 5px solid var(--color-primary);
}
.eta-hero--on_time    { border-color: var(--color-accent-green); background: linear-gradient(135deg, #F0FDF4, #ECFDF5); }
.eta-hero--minor_delay{ border-color: var(--color-warning); background: linear-gradient(135deg, #FFFBEB, #FEF9C3); }
.eta-hero--major_delay{ border-color: #F97316; background: linear-gradient(135deg, #FFF7ED, #FFEDD5); }
.eta-hero--critical_delay { border-color: var(--color-danger); background: linear-gradient(135deg, #FFF5F5, #FEE2E2); }

.eta-label { font-size: 11px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
.eta-status-text { font-size: 28px; font-weight: 900; font-family: var(--font-heading); color: #15803D; }
.eta-status-departed { color: #94A3B8; }
.eta-current-stop { font-size: 11px; margin-top: 6px; }
.eta-badge--status { background: #DCFCE7; color: #15803D; }
.eta-hero--status { border-color: #16A34A !important; }
.eta-countdown { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8px; }
.eta-number { font-size: 52px; font-weight: 900; font-family: var(--font-heading); line-height: 1; color: var(--color-text); }
.eta-unit   { font-size: 18px; font-weight: 700; color: var(--color-muted); }
.eta-seconds { font-size: 14px; color: var(--color-muted); }

.eta-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700;
}
.eta-badge--on_time    { background: #DCFCE7; color: #15803D; }
.eta-badge--minor_delay{ background: #FEF9C3; color: #A16207; }
.eta-badge--major_delay{ background: #FFEDD5; color: #C2410C; }
.eta-badge--critical_delay { background: #FEE2E2; color: #DC2626; }

.eta-hero-right { text-align: right; }
.eta-route-dot {
  position: relative; overflow: hidden;
  min-width: 62px; height: 56px; border-radius: 16px; padding: 0 12px;
  background: var(--color-primary); margin-left: auto; margin-bottom: 4px;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 16px rgba(11,19,36,0.22),
              inset 0 1px 0 rgba(255,255,255,0.5),
              inset 0 -12px 18px rgba(0,0,0,0.16);
}
.eta-route-num {
  font-family: var(--font-heading); font-weight: 800; font-size: 19px;
  color: #fff; letter-spacing: 0.03em; text-shadow: 0 1px 3px rgba(0,0,0,0.32);
}
.eta-adaptive { font-size: 11px; margin-top: 4px; max-width: 100px; }

/* ── Guided journey ── */
.guide-start { margin: 0 16px 12px; text-align: center; }
.guide-hint { font-size: 11px; margin-top: 6px; }
.guide-active { margin: 0 16px 12px; padding: 16px; border-left: 5px solid var(--color-primary); }
.guide-active--getoff  { border-color: #F59E0B; background: linear-gradient(135deg, #FFFBEB, #FEF3C7); }
.guide-active--arrived { border-color: #16A34A; background: linear-gradient(135deg, #F0FDF4, #DCFCE7); }
.guide-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.guide-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.06em; }
.guide-stop { font-size: 12px; font-weight: 700; color: var(--color-danger); }
.guide-headline { font-size: 18px; font-weight: 800; font-family: var(--font-heading); margin-bottom: 2px; }
.guide-sub { font-size: 12px; }
.guide-progress { margin-top: 10px; height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden; }
.guide-progress__fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }

.getoff-alert {
  position: fixed; left: 16px; right: 16px; bottom: 80px; z-index: 1000;
  display: flex; align-items: center; gap: 12px; padding: 16px;
  background: #F59E0B; color: #1F2937; border-radius: 16px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.22); cursor: pointer;
}
.getoff-icon { font-size: 28px; animation: etaPulse 1s ease infinite; }
.getoff-title { font-weight: 800; font-size: 15px; }
.getoff-sub { font-size: 13px; }
.slide-up-enter-active, .slide-up-leave-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(20px); opacity: 0; }

/* ── Times ── */
.times-card { margin: 0 16px 10px; padding: 16px; }
.times-row  { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.time-col   { flex: 1; }
.time-col--right { text-align: right; }
.tc-label { font-size: 10px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
.tc-time  { font-size: 26px; font-weight: 800; font-family: var(--font-heading); }
.tc-stop  { font-size: 11px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.time-mid { flex: 1.4; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.time-dur-pill { background: var(--color-bg); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; color: var(--color-primary); }
.time-line { width: 100%; height: 2px; border-radius: 1px; background: var(--color-primary); }
.times-meta { display: flex; gap: 16px; font-size: 13px; color: var(--color-muted); padding-top: 10px; border-top: 1px solid var(--color-border); font-weight: 600; }

/* ── Map preview ── */
.map-preview-card { margin: 0 16px 10px; padding: 14px; overflow: hidden; }
.mp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mp-title { font-weight: 700; font-size: 14px; }
.mp-expand { font-size: 13px; color: var(--color-primary); font-weight: 600; }
.detail-map { height: 180px; border-radius: var(--radius-md); overflow: hidden; }
.mp-bus-count { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-muted); margin-top: 8px; font-weight: 600; }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-accent-green); animation: etaPulse 1.4s ease infinite; }
@keyframes etaPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.4);} }

/* ── Transfer legs ── */
.legs-card { margin: 0 16px 10px; padding: 16px; }
.leg-row { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--color-border); }
.leg-row:last-child { border-bottom: none; }
.leg-icon { font-size: 20px; flex-shrink: 0; width: 28px; text-align: center; margin-top: 2px; }
.leg-content { flex: 1; min-width: 0; }
.leg-route { font-weight: 700; font-size: 14px; margin-bottom: 2px; }
.leg-stops { font-size: 12px; margin-bottom: 1px; }
.leg-time { font-size: 12px; }

/* ── Stops ── */
.stops-card { margin: 0 16px 10px; padding: 16px; }
.stops-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.stops-live { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; background: var(--color-bg); color: var(--color-muted); white-space: nowrap; }
.stops-live.live-riding      { background: #DCFCE7; color: #15803D; }
.stops-live.live-approaching { background: #DBEAFE; color: #1D4ED8; }
.stops-live.live-waiting     { background: #F1F5F9; color: #64748B; }
.stops-live-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: etaPulse 1.4s ease infinite; }

/* live stop states */
.stop-tl-row.st-passed { opacity: 0.5; }
.stop-tl-dot--current { background: transparent !important; border: none !important; display: flex; align-items: center; justify-content: center; width: 22px !important; height: 22px !important; margin-left: -3px; }
.stop-tl-bus { font-size: 18px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); animation: etaPulse 1.2s ease infinite; }
.stop-tl-dot--passed { background: var(--color-primary) !important; border-color: var(--color-primary) !important; }
.stop-tl-line.done { background: var(--color-primary) !important; }
.stop-tl-name--current { font-weight: 800 !important; color: var(--color-text) !important; }
.stop-tl-here { font-size: 10px; font-weight: 800; color: var(--color-primary); background: #F0FDFC; padding: 2px 7px; border-radius: 10px; }

/* ── Bus info ── */
.bus-info-card { margin: 0 16px 16px; padding: 16px; }
.bus-info-row { display: flex; align-items: center; gap: 12px; }
.bus-icon-wrap { font-size: 28px; }
.bus-info-text { flex: 1; }
.bus-plate { font-weight: 700; font-size: 15px; }
.bus-progress-col { width: 100px; }

/* ── Empty ── */
.empty-state { text-align: center; padding: 60px 20px; }
</style>
