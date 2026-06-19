<template>
  <div class="page results">
    <!-- Header -->
    <div class="results-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div class="results-title">
        <p class="results-route text-muted" v-if="journeyStore.origin && journeyStore.destination">
          {{ journeyStore.originName }} → {{ journeyStore.destinationName }}
        </p>
        <h2>Journey Options</h2>
      </div>
    </div>

    <!-- Sort tabs -->
    <div v-if="!journeyStore.loading && journeyStore.results.length" class="sort-bar">
      <button
        v-for="opt in sortOptions" :key="opt.value"
        class="sort-tab" :class="{ on: journeyStore.sort === opt.value }"
        @click="changeSort(opt.value)"
      >{{ opt.label }}</button>
    </div>

    <!-- Loading -->
    <div v-if="journeyStore.loading" class="results-body">
      <div v-for="i in 3" :key="i" class="journey-card skeleton" style="height:140px;border-radius:16px;margin-bottom:12px"></div>
    </div>

    <!-- Error -->
    <div v-else-if="journeyStore.error" class="empty-state">
      <div class="empty-icon">⚠️</div>
      <h3>Search Error</h3>
      <p class="text-muted">{{ journeyStore.error }}</p>
      <button class="btn btn-outline" style="margin-top:16px" @click="router.push('/planner')">Try again</button>
    </div>

    <!-- No results -->
    <div v-else-if="journeyStore.searched && journeyStore.results.length === 0" class="empty-state">
      <div class="empty-icon">🚌</div>
      <h3>No Route in Dataset</h3>
      <p class="text-muted" style="margin-bottom:12px">
        No real route found for this journey in the current EcoFleet dataset.
      </p>
      <div class="no-route-suggestions">
        <p class="text-muted" style="font-size:12px;font-weight:700;margin-bottom:8px">Try a supported route:</p>
        <button class="suggestion-chip" @click="quickSearch('Downtown','Kabuga')">Downtown → Kabuga</button>
        <button class="suggestion-chip" @click="quickSearch('Remera','Nyabugogo')">Remera → Nyabugogo</button>
        <button class="suggestion-chip" @click="quickSearch('Kabuga','Nyabugogo')">Kabuga → Nyabugogo</button>
      </div>
      <button class="btn btn-outline" style="margin-top:16px" @click="router.push('/planner')">Change stops</button>
    </div>

    <!-- Results list -->
    <div v-else class="results-body">
      <TransitionGroup name="list" tag="div">
        <div
          v-for="(journey, idx) in visibleResults"
          :key="journey.journeyId || idx"
          class="journey-card card card-hover"
          @click="selectJourney(journey)"
        >
          <!-- Route + type row -->
          <div class="jc-header">
            <div class="jc-badge" :style="{ background: journey.routeColor || '#0EA5A3' }">
              {{ journey.routeCode || journey.legs?.[0]?.routeCode }}
            </div>
            <div class="jc-headtext">
              <span class="jc-name">{{ journey.routeName || journey.legs?.[0]?.headsign }}</span>
              <span v-if="journey.vehicle?.plate" class="jc-bus">🚌 {{ journey.vehicle.plate }}</span>
            </div>
            <span class="jc-type badge" :class="journey.type === 'transfer' ? 'badge-warn' : 'badge-ok'">
              {{ journey.type === 'transfer' ? '1 transfer' : 'Direct' }}
            </span>
          </div>

          <!-- Bus status — live countdown -->
          <div class="jc-wait-row">
            <div class="jc-wait-badge" :class="busStatusClass(journey)">
              <span class="jc-wait-dot" v-if="busStatusClass(journey) !== 'status-departed'"></span>
              {{ busStatusLabel(journey) }}
            </div>
            <span class="jc-depart-label">
              Departs <b>{{ journey.summary?.departureTime }}</b>
            </span>
          </div>

          <!-- Times row -->
          <div class="jc-times">
            <div class="jc-time-block">
              <p class="jc-time-big">{{ journey.summary?.departureTime }}</p>
              <p class="jc-stop-name text-muted">{{ fmtStop(journey.fromStop?.name) }}</p>
            </div>
            <div class="jc-duration-col">
              <span class="jc-duration-pill">{{ journey.summary?.durationMinutes }}min</span>
              <div class="jc-connector">
                <div class="jc-line" :style="{ background: journey.routeColor || '#0EA5A3' }"></div>
                <span class="jc-stops-count">{{ journey.summary?.numberOfStops || '—' }} stops</span>
              </div>
            </div>
            <div class="jc-time-block jc-time-block--right">
              <p class="jc-time-big">{{ journey.summary?.arrivalTime }}</p>
              <p class="jc-stop-name text-muted">{{ fmtStop(journey.toStop?.name) }}</p>
            </div>
          </div>

          <!-- Door-to-door walk summary -->
          <div v-if="journey.summary?.doorToDoor && journey.summary?.walkMinutes" class="jc-walk">
            🚶 {{ journey.summary.accessWalk ? `${journey.summary.accessWalk.minutes} min walk to stop` : '' }}
            {{ journey.summary.accessWalk && journey.summary.egressWalk ? '·' : '' }}
            {{ journey.summary.egressWalk ? `${journey.summary.egressWalk.minutes} min walk to destination` : '' }}
          </div>

          <!-- Meta row: delay + fare -->
          <div class="jc-meta">
            <span class="jc-meta-item" :class="delayClass(journey.summary?.delayStatus)">
              {{ delayLabel(journey.summary?.delayStatus, journey.summary?.delayMinutes) }}
            </span>
            <span class="jc-meta-item text-muted">{{ journey.summary?.fareEstimate?.distanceKm }} km</span>
            <span class="jc-meta-item jc-fare">
              {{ journey.summary?.fareEstimate?.amount?.toLocaleString() }} {{ journey.summary?.fareEstimate?.currency || 'RWF' }}
            </span>
          </div>

          <!-- EcoFleet alert -->
          <div v-if="journey.summary?.ecofleetAlert?.triggered" class="jc-ecofleet">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {{ journey.summary.ecofleetAlert.message }}
          </div>

          <!-- Adaptive message -->
          <div v-else-if="journey.summary?.adaptiveMessage && journey.summary.adaptiveMessage !== 'On time'" class="jc-adaptive">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ journey.summary.adaptiveMessage }}
          </div>

          <!-- Next departures -->
          <div v-if="journey.nextDepartures?.length" class="jc-next-buses">
            <span class="jc-next-label">Also:</span>
            <span v-for="(nd, ni) in journey.nextDepartures" :key="ni" class="jc-next-time">{{ nd.departureTime }}</span>
          </div>

          <!-- Distance + fare -->
          <div class="jc-distance">
            <span class="jc-dist-km text-muted">{{ journey.summary?.fareEstimate?.distanceKm }} km road</span>
          </div>

          <!-- View button -->
          <button class="btn btn-primary jc-view-btn">
            View Journey →
          </button>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJourneyStore } from '../stores/journeyStore';

const router       = useRouter();
const journeyStore = useJourneyStore();

// Live list: drop buses that have already departed (countdown passed),
// unless that journey is the one the passenger selected.
const visibleResults = computed(() => {
  const cur = nowMins();
  return journeyStore.results.filter(j => {
    if (journeyStore.selectedJourney?.journeyId === j.journeyId) return true;
    const dep = j.summary?.departureTime;
    if (!dep) return true;
    let [h, m] = dep.split(':').map(Number);
    let depM = h * 60 + m;
    // handle just-after-midnight departures when it's late evening
    if (depM < cur - 720) depM += 1440;
    return depM - cur >= -1; // keep until ~1 min after departure
  });
});

const sortOptions = [
  { value: 'best',           label: 'Best' },
  { value: 'fastest',        label: 'Fastest' },
  { value: 'fewest_changes', label: 'Fewest changes' },
  { value: 'least_walking',  label: 'Least walking' },
];
async function changeSort(value) {
  if (journeyStore.sort === value) return;
  await journeyStore.changeSort(value);
}

// Quick-search shortcut for supported routes shown in the no-route empty state
async function quickSearch(from, to) {
  const make = name => ({ stop_name: name, name, label: name });
  journeyStore.setOrigin(make(from));
  journeyStore.setDestination(make(to));
  await journeyStore.search();
}

// ── live clock for real-time bus status ──
const now = ref(new Date());
let clockTimer = null;
onMounted(() => { clockTimer = setInterval(() => { now.value = new Date(); }, 1000); });
onUnmounted(() => clearInterval(clockTimer));

function nowMins() {
  const n = now.value;
  return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
}

function busStatusLabel(journey) {
  const depTime = journey.summary?.departureTime;
  if (!depTime) return '—';
  const [h, m] = depTime.split(':').map(Number);
  const diff = h * 60 + m - nowMins();
  if (diff < -2)   return 'Departed';
  if (diff <= 0.5) return 'Departing now';
  if (diff <= 60)  return `In ${Math.ceil(diff)} min`;
  return 'Next bus';
}

function busStatusClass(journey) {
  const depTime = journey.summary?.departureTime;
  if (!depTime) return 'wait-ok';
  const [h, m] = depTime.split(':').map(Number);
  const diff = h * 60 + m - nowMins();
  if (diff < -2)   return 'status-departed';
  if (diff <= 0.5) return 'wait-now';
  if (diff <= 5)   return 'wait-soon';
  if (diff <= 15)  return 'wait-ok';
  return 'wait-long';
}

function fmtStop(name = '') {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  const clean  = isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
  return clean.length > 16 ? clean.slice(0, 15) + '…' : clean;
}

function delayLabel(status, mins) {
  if (!status || status === 'on_time') return 'On time';
  if (status === 'minor_delay') return `+${mins || ''}min delay`;
  if (status === 'major_delay') return `Major delay`;
  return `Critical delay`;
}

function delayClass(status) {
  if (!status || status === 'on_time') return 'jc-ok';
  if (status === 'minor_delay') return 'jc-warn';
  return 'jc-danger';
}

function etaBadgeClass(journey) {
  const status = journey.summary?.delayStatus;
  if (!status || status === 'on_time') return 'jc-ok';
  if (status === 'minor_delay') return 'jc-warn';
  return 'jc-danger';
}

function waitBadgeClass(journey) {
  const w = journey.summary?.waitMinutes || journey.summary?.etaToPickupMinutes || 0;
  if (w <= 3)  return 'wait-now';
  if (w <= 10) return 'wait-soon';
  if (w <= 15) return 'wait-ok';
  return 'wait-long';
}

function selectJourney(journey) {
  journeyStore.selectJourney(journey);
  router.push(`/journey/${journey.journeyId || '1'}`);
}
</script>

<style scoped>
.results { background: var(--color-bg); }

.results-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 16px 12px; border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
}
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); flex-shrink: 0; }
.back-btn svg { width: 20px; height: 20px; }
.results-route { font-size: 12px; margin-bottom: 2px; }
h2 { font-size: 20px; }

.sort-bar { display: flex; gap: 6px; padding: 10px 16px 2px; overflow-x: auto; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.sort-tab { flex-shrink: 0; font-size: 12px; font-weight: 600; padding: 7px 13px; border-radius: 18px; background: var(--color-bg); border: 1px solid var(--color-border); color: var(--color-muted); white-space: nowrap; cursor: pointer; }
.sort-tab.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

.jc-walk { font-size: 12px; color: var(--color-muted); margin-bottom: 8px; padding: 6px 8px; background: var(--color-bg); border-radius: 8px; }

.results-body { padding: 14px 16px; flex: 1; }

.journey-card { padding: 16px; margin-bottom: 12px; cursor: pointer; }

/* Header */
.jc-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.jc-badge {
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  min-width: 46px; height: 38px; padding: 0 10px; border-radius: 11px;
  font-family: var(--font-heading); font-size: 14px; font-weight: 800;
  color: #fff; flex-shrink: 0; letter-spacing: 0.03em;
  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
  box-shadow: 0 4px 11px rgba(11,19,36,0.18),
              inset 0 1px 0 rgba(255,255,255,0.45),
              inset 0 -8px 14px rgba(0,0,0,0.14);
}
.jc-headtext { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.jc-name { font-size: 13px; font-weight: 600; color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jc-bus { font-size: 11px; font-weight: 700; color: var(--color-muted); letter-spacing: 0.02em; }
.jc-type { font-size: 10px; font-weight: 700; padding: 3px 8px; flex-shrink: 0; }
.badge-ok   { background: #DCFCE7; color: #15803D; }
.badge-warn { background: #FEF9C3; color: #A16207; }

/* Times */
.jc-times { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.jc-time-block { flex: 1; }
.jc-time-block--right { text-align: right; }
.jc-time-big { font-size: 24px; font-weight: 800; font-family: var(--font-heading); line-height: 1; }
.jc-stop-name { font-size: 11px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jc-duration-col { flex: 1.2; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.jc-duration-pill { background: var(--color-bg); padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 700; color: var(--color-primary); white-space: nowrap; }
.jc-connector { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.jc-line { width: 100%; height: 2px; border-radius: 1px; }
.jc-stops-count { font-size: 10px; color: var(--color-muted); font-weight: 600; }

/* Meta */
.jc-meta { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.jc-meta-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 600; padding: 4px 8px; border-radius: 20px;
}
.jc-ok     { background: #DCFCE7; color: #15803D; }
.jc-warn   { background: #FEF9C3; color: #A16207; }
.jc-danger { background: #FEE2E2; color: #DC2626; }
.jc-fare   { background: var(--color-bg); color: var(--color-text); margin-left: auto; font-weight: 700; }
.eta-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; animation: etaPulse 1.4s ease infinite; }
@keyframes etaPulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.4);} }

/* Adaptive */
/* Wait badge */
.jc-wait-row   { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.jc-wait-badge { display:flex; align-items:center; gap:6px; padding:5px 12px; border-radius:20px; font-size:13px; font-weight:800; }
.jc-wait-dot   { width:8px; height:8px; border-radius:50%; background:currentColor; animation:etaPulse 1.4s ease infinite; }
.wait-now       { background:#DCFCE7; color:#15803D; }
.wait-soon      { background:#D1FAE5; color:#065F46; }
.wait-ok        { background:#DBEAFE; color:#1D4ED8; }
.wait-long      { background:#FEF3C7; color:#92400E; }
.status-departed{ background:#F1F5F9; color:#94A3B8; }
.jc-depart-label { font-size:12px; color:var(--color-muted); }
.jc-depart-label b { color:var(--color-text); }

.jc-adaptive { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-muted); margin-bottom: 8px; padding: 6px 8px; background: #FFFBEB; border-radius: 8px; }

.jc-ecofleet {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: #92400E; margin-bottom: 8px; padding: 7px 10px;
  background: #FEF3C7; border-radius: 8px; border-left: 3px solid #F59E0B;
}

.jc-next-buses { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.jc-next-label { font-size: 11px; color: var(--color-muted); font-weight: 600; }
.jc-next-time { font-size: 12px; font-weight: 700; background: var(--color-bg); padding: 3px 8px; border-radius: 8px; color: var(--color-text); }

.jc-distance { margin-bottom: 8px; }
.jc-dist-km  { font-size: 11px; }

.jc-view-btn { width: 100%; margin-top: 4px; font-size: 14px; padding: 10px; }

/* Empty state */
.empty-state { text-align: center; padding: 48px 20px; }
.no-route-suggestions { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:0 0 4px; }
.suggestion-chip {
  padding:8px 14px; border-radius:20px; font-size:13px; font-weight:600;
  background:var(--color-bg); border:1.5px solid var(--color-primary);
  color:var(--color-primary); cursor:pointer; transition:background 0.15s;
}
.suggestion-chip:hover { background:var(--color-primary); color:#fff; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
h3 { font-size: 20px; margin-bottom: 8px; }
</style>
