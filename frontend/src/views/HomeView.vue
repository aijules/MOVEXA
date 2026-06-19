<template>
  <div class="page home">
    <!-- Header -->
    <div class="home-header">
      <div class="home-greeting">
        <p class="home-city">Kigali, Rwanda 🇷🇼</p>
        <h1 class="home-title">Where to go?</h1>
      </div>
      <router-link to="/profile" class="avatar-btn" aria-label="Profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </router-link>
    </div>

    <!-- Search card -->
    <div class="search-card card">
      <div class="search-field" @click="goToPlanner('origin')">
        <span class="search-dot from"></span>
        <span class="search-field__text" :class="{ placeholder: !journeyStore.origin }">
          {{ journeyStore.originName || 'From — choose a stop' }}
        </span>
        <button v-if="journeyStore.origin" class="clear-x" @click.stop="journeyStore.setOrigin(null)">✕</button>
      </div>

      <div class="search-divider-row">
        <div class="search-v-line"></div>
        <button class="swap-btn" @click="journeyStore.swap()" aria-label="Swap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
        </button>
      </div>

      <div class="search-field" @click="goToPlanner('destination')">
        <span class="search-dot to"></span>
        <span class="search-field__text" :class="{ placeholder: !journeyStore.destination }">
          {{ journeyStore.destinationName || 'To — enter destination' }}
        </span>
        <button v-if="journeyStore.destination" class="clear-x" @click.stop="journeyStore.setDestination(null)">✕</button>
      </div>

      <button
        class="btn btn-primary btn-full search-btn"
        :disabled="!journeyStore.origin || !journeyStore.destination || journeyStore.loading"
        @click="doSearch"
      >
        <svg v-if="!journeyStore.loading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <span class="spin" v-else></span>
        {{ journeyStore.loading ? 'Searching...' : 'Find Routes' }}
      </button>
    </div>

    <!-- Alert strip -->
    <transition name="fade">
      <div v-if="appStore.alerts.length" class="alert-strip" @click="router.push('/alerts')">
        <span class="alert-dot" :class="topAlert?.severity"></span>
        <span class="alert-strip__text">{{ topAlert?.title }}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-arrow"><path d="M9 18l6-6-6-6"/></svg>
      </div>
    </transition>

    <!-- Nearby stops -->
    <section class="home-section">
      <div class="section-header">
        <h2 class="section-title">Nearby Stops</h2>
        <router-link to="/nearby" class="see-all">See all</router-link>
      </div>

      <div v-if="stopsStore.loading" class="chips-row">
        <div v-for="i in 4" :key="i" class="stop-chip skeleton" style="height:72px;width:130px"></div>
      </div>
      <div v-else-if="stopsStore.nearbyStops.length" class="chips-row">
        <button
          v-for="stop in stopsStore.nearbyStops.slice(0, 5)" :key="stop.id || stop._id"
          class="stop-chip card card-hover"
          @click="quickSetOrigin(stop)"
        >
          <span class="stop-chip__icon">🚌</span>
          <span class="stop-chip__name">{{ formatStopName(stop.stop_name || stop.name) }}</span>
          <span v-if="stop.distance_meters" class="stop-chip__dist">{{ fmtDist(stop.distance_meters) }}</span>
        </button>
      </div>
      <div v-else class="empty-nearby">
        <button class="btn btn-ghost" @click="getLocation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          Use my location
        </button>
      </div>
    </section>

    <!-- Popular routes -->
    <section class="home-section">
      <div class="section-header">
        <h2 class="section-title">All Routes</h2>
        <router-link to="/map" class="see-all">Map view</router-link>
      </div>

      <div v-if="linesStore.loading" class="routes-grid">
        <div v-for="i in 9" :key="i" class="route-badge skeleton" style="height:40px"></div>
      </div>
      <div v-else class="routes-grid">
        <router-link
          v-for="line in linesStore.lines.slice(0, 18)" :key="line.id || line._id"
          :to="`/lines/${line.id || line._id}`"
          class="route-badge"
          :style="{ background: line.color, color: line.textColor || '#fff' }"
        >
          {{ line.shortName || line.route_code }}
        </router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useJourneyStore } from '../stores/journeyStore';
import { useStopsStore }   from '../stores/stopsStore';
import { useLinesStore }   from '../stores/linesStore';
import { useAppStore }     from '../stores/appStore';

const router       = useRouter();
const journeyStore = useJourneyStore();
const stopsStore   = useStopsStore();
const linesStore   = useLinesStore();
const appStore     = useAppStore();

const topAlert = computed(() => appStore.alerts[0]);

function fmtDist(m) { return m >= 1000 ? `${(m/1000).toFixed(1)}km` : `${m}m`; }

function formatStopName(name = '') {
  if (!name) return '';
  // Title-case the name, remove route code suffix (last word if it's uppercase letters+digits)
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  const clean = isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
  return clean.length > 18 ? clean.slice(0, 17) + '…' : clean;
}

function goToPlanner(field) {
  router.push({ name: 'Planner', query: { field } });
}

function quickSetOrigin(stop) {
  journeyStore.setOrigin({ ...stop, name: stop.stop_name || stop.name, stop_name: stop.stop_name || stop.name });
  router.push({ name: 'Planner', query: { field: 'destination' } });
}

async function doSearch() {
  await journeyStore.search();
  if (!journeyStore.error) router.push('/results');
}

function getLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    stopsStore.fetchNearby(pos.coords.latitude, pos.coords.longitude);
  });
}

onMounted(() => {
  linesStore.fetchLines();
  getLocation();
  appStore.fetchAlerts();
});
</script>

<style scoped>
.home { background: var(--color-bg); }

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px 20px 12px;
}
.home-city { font-size: 12px; color: var(--color-muted); font-weight: 700; margin-bottom: 3px; letter-spacing: 0.01em; }
.home-title { font-size: 31px; font-weight: 800; line-height: 1.08; letter-spacing: -0.035em; }
.avatar-btn {
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--color-border); display: flex; align-items: center; justify-content: center;
  margin-top: 4px; flex-shrink: 0; transition: background 0.18s;
}
.avatar-btn:hover { background: var(--color-primary); color: #fff; }
.avatar-btn svg { width: 20px; height: 20px; }

/* ── Search card ── */
.search-card {
  margin: 0 16px 14px; padding: 13px;
  box-shadow: var(--shadow-md);
  border: 1px solid rgba(13,148,136,0.10);
  position: relative;
}
.search-card::before {
  content: ''; position: absolute; left: 18px; right: 18px; top: 0; height: 3px;
  border-radius: 0 0 4px 4px; background: var(--grad-aurora); opacity: 0.9;
}

.search-field {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 14px; border-radius: var(--radius-md);
  background: var(--color-bg); cursor: pointer;
  transition: background 0.15s;
  min-height: 50px;
}
.search-field:hover { background: #EFF6FF; }
.search-field__text { flex: 1; font-size: 14px; font-weight: 500; color: var(--color-text); }
.search-field__text.placeholder { color: var(--color-muted); font-weight: 400; }

.search-dot {
  width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
}
.search-dot.from { background: var(--color-primary); box-shadow: 0 0 0 4px rgba(13,148,136,0.15); }
.search-dot.to   { background: var(--color-danger); box-shadow: 0 0 0 4px rgba(239,68,68,0.15); }

.clear-x { font-size: 13px; color: var(--color-muted); padding: 4px; line-height: 1; }

.search-divider-row {
  display: flex; align-items: center; padding: 0 14px; position: relative;
}
.search-v-line { width: 2px; height: 20px; background: var(--color-border); margin-left: 5.5px; border-radius: 1px; }
.swap-btn {
  position: absolute; right: 14px;
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--color-border); display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, transform 0.2s;
}
.swap-btn:hover { background: var(--color-primary); color: #fff; transform: rotate(180deg); }
.swap-btn svg { width: 15px; height: 15px; }

.search-btn { margin-top: 10px; }
.search-btn svg { width: 18px; height: 18px; }
.spin {
  width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff; border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Alert strip ── */
.alert-strip {
  display: flex; align-items: center; gap: 10px;
  margin: 0 16px 12px; padding: 12px 14px;
  background: #FFFBEB; border-radius: var(--radius-md);
  border-left: 4px solid var(--color-warning); cursor: pointer;
  transition: opacity 0.18s;
}
.alert-strip:hover { opacity: 0.85; }
.alert-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-warning); flex-shrink: 0; }
.alert-dot.critical { background: var(--color-danger); }
.alert-strip__text { flex: 1; font-size: 13px; font-weight: 600; color: #92400E; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alert-arrow { width: 16px; height: 16px; color: var(--color-muted); }

/* ── Sections ── */
.home-section { padding: 4px 20px 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.see-all { font-size: 13px; color: var(--color-primary); font-weight: 600; }

.chips-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.chips-row::-webkit-scrollbar { display: none; }

.stop-chip {
  flex-shrink: 0; width: 138px; min-height: 78px; padding: 12px 13px;
  border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 5px;
  cursor: pointer; text-align: left; background: var(--color-surface);
  border: 1px solid rgba(227,233,242,0.9);
}
.stop-chip__icon {
  font-size: 16px; width: 30px; height: 30px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #CCFBF1, #DBEAFE);
}
.stop-chip__name { font-size: 12.5px; font-weight: 700; color: var(--color-text); line-height: 1.3; }
.stop-chip__dist { font-size: 11px; color: var(--color-primary); font-weight: 700; }
.empty-nearby { padding: 8px 0 4px; }

.routes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.route-badge {
  position: relative; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  height: 54px; border-radius: 16px;
  font-family: var(--font-heading); font-weight: 800; font-size: 16px;
  letter-spacing: 0.04em; color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.32); cursor: pointer;
  box-shadow: 0 6px 16px rgba(11,19,36,0.16),
              inset 0 1px 0 rgba(255,255,255,0.5),
              inset 0 -14px 22px rgba(0,0,0,0.12);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.route-badge:hover {
  transform: translateY(-2px); filter: saturate(1.08) brightness(1.05);
  box-shadow: 0 12px 26px rgba(11,19,36,0.24), inset 0 1px 0 rgba(255,255,255,0.55);
}
.route-badge:active { transform: translateY(0); }
</style>
