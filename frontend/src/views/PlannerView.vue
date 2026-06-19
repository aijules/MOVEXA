<template>
  <div class="page planner">
    <!-- Header -->
    <div class="planner-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div class="planner-fields card">
        <div class="pf-row" :class="{ active: activeField === 'origin' }" @click="activeField = 'origin'">
          <span class="pf-dot from"></span>
          <div class="pf-info">
            <span class="pf-label">From</span>
            <span class="pf-val" :class="{ muted: !journeyStore.origin }">
              {{ fmtName(journeyStore.origin) || 'Choose origin' }}
            </span>
          </div>
          <button v-if="journeyStore.origin" class="clear-x" @click.stop="journeyStore.setOrigin(null); searchQ = ''">✕</button>
        </div>
        <div class="pf-divider">
          <button class="swap-btn" @click="swap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
          </button>
        </div>
        <div class="pf-row" :class="{ active: activeField === 'destination' }" @click="activeField = 'destination'">
          <span class="pf-dot to"></span>
          <div class="pf-info">
            <span class="pf-label">To</span>
            <span class="pf-val" :class="{ muted: !journeyStore.destination }">
              {{ fmtName(journeyStore.destination) || 'Choose destination' }}
            </span>
          </div>
          <button v-if="journeyStore.destination" class="clear-x" @click.stop="journeyStore.setDestination(null); searchQ = ''">✕</button>
        </div>
      </div>
    </div>

    <!-- Depart / Arrive time control -->
    <div class="time-bar">
      <div class="time-modes">
        <button :class="{ on: timeMode === 'now' }"    @click="setMode('now')">Leave now</button>
        <button :class="{ on: timeMode === 'depart' }" @click="setMode('depart')">Depart at</button>
        <button :class="{ on: timeMode === 'arrive' }" @click="setMode('arrive')">Arrive by</button>
      </div>
      <input
        v-if="timeMode !== 'now'"
        type="time"
        class="time-input"
        v-model="timeVal"
        @change="journeyStore.setTimeMode(timeMode, timeVal)"
      />
    </div>

    <!-- Search input -->
    <div class="search-box" v-if="activeField">
      <div class="search-input-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          ref="inputRef"
          v-model="searchQ"
          @input="onInput"
          class="search-input"
          :placeholder="pendingSlot ? `Choose your ${pendingSlot} location…` : 'Search stop or address…'"
          autocomplete="off" autocorrect="off" spellcheck="false"
        />
        <button v-if="searchQ" class="clear-x" @click="resetSearch">✕</button>
      </div>
    </div>

    <!-- Results -->
    <div class="results-area">
      <!-- Quick picks shown when there's no query -->
      <template v-if="searchQ.length < 2">
        <div class="quick-grid">
          <button class="quick-chip" @click="pickSaved('home')">
            <span class="qc-ic">🏠</span>
            <span class="qc-txt">{{ places.home ? fmt(places.home.label) : 'Set Home' }}</span>
          </button>
          <button class="quick-chip" @click="pickSaved('work')">
            <span class="qc-ic">💼</span>
            <span class="qc-txt">{{ places.work ? fmt(places.work.label) : 'Set Work' }}</span>
          </button>
          <button v-if="canUseLocation" class="quick-chip" @click="useMyLocation">
            <span class="qc-ic">📍</span>
            <span class="qc-txt">My location</span>
          </button>
        </div>

        <!-- Recent searches -->
        <div v-if="places.history.length" class="recent">
          <div class="recent-head">
            <span>Recent</span>
            <button class="recent-clear" @click="places.clearHistory()">Clear</button>
          </div>
          <button
            v-for="(h, i) in places.history" :key="i"
            class="stop-row"
            @click="rerun(h)"
          >
            <span class="stop-row__icon">🕘</span>
            <div class="stop-row__info">
              <span class="stop-row__name">{{ fmt(displayName(h.from)) }} → {{ fmt(displayName(h.to)) }}</span>
            </div>
            <svg class="stop-row__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>

        <div v-else class="hint">
          <p class="text-muted">Type a stop name or address to search</p>
          <p class="text-muted" style="font-size:12px;margin-top:4px">e.g. Downtown, Kabuga, Kigali Heights</p>
        </div>
      </template>

      <!-- Loading skeletons -->
      <template v-else-if="loading">
        <div v-for="i in 5" :key="i" class="stop-row skeleton" style="height:60px;margin-bottom:6px;border-radius:12px"></div>
      </template>

      <!-- Combined stop + place list -->
      <TransitionGroup name="list" tag="div" v-else-if="combined.length">
        <button
          v-for="item in combined" :key="item._key"
          class="stop-row"
          @click="select(item)"
        >
          <span class="stop-row__icon">{{ item.type === 'place' ? '📍' : '🚏' }}</span>
          <div class="stop-row__info">
            <span class="stop-row__name">{{ fmt(item.label) }}</span>
            <span class="stop-row__code text-muted">{{ item.sub || (item.type === 'place' ? 'Address' : 'Bus stop') }}</span>
          </div>
          <svg class="stop-row__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </TransitionGroup>

      <!-- Empty -->
      <div v-else class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No matches for <strong>"{{ searchQ }}"</strong></p>
        <p class="text-muted">Try a stop name or a nearby address</p>
      </div>
    </div>

    <!-- CTA -->
    <transition name="slide-up">
      <div v-if="journeyStore.origin && journeyStore.destination" class="planner-cta">
        <button class="btn btn-primary btn-full" @click="doSearch" :disabled="journeyStore.loading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          {{ journeyStore.loading ? 'Searching…' : 'Find Routes' }}
        </button>
        <p class="cta-route text-muted">
          {{ journeyStore.originName }} → {{ journeyStore.destinationName }}
        </p>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useJourneyStore } from '../stores/journeyStore';
import { usePlacesStore }  from '../stores/placesStore';
import { stopsApi, geocodeApi } from '../services/api';

const router       = useRouter();
const route        = useRoute();
const journeyStore = useJourneyStore();
const places       = usePlacesStore();

const activeField = ref(route.query.field === 'destination' ? 'destination' : 'origin');
const searchQ     = ref('');
const inputRef    = ref(null);
const loading     = ref(false);
const combined    = ref([]);       // merged stops + geocoded places
const timeMode    = ref(journeyStore.timeMode);
const timeVal     = ref(journeyStore.time);
const pendingSlot = ref(null);     // 'home' | 'work' while choosing a place to save
const canUseLocation = typeof navigator !== 'undefined' && 'geolocation' in navigator;

let debounceTimer;
function onInput() {
  clearTimeout(debounceTimer);
  combined.value = [];
  if (searchQ.value.length < 2) return;
  loading.value = true;
  debounceTimer = setTimeout(runSearch, 280);
}

async function runSearch() {
  const q = searchQ.value.trim();
  if (q.length < 2) { loading.value = false; return; }
  try {
    // Query bus stops and geocoded places in parallel; stops rank first.
    const [stopsRes, placesRes] = await Promise.allSettled([
      stopsApi.search(q, 12),
      geocodeApi.search(q),
    ]);
    const stops = (stopsRes.value?.data || []).map(s => ({
      type: 'stop',
      id: s.id, stopId: s.id,
      label: s.stop_name || s.name,
      sub: 'Bus stop',
      lat: Number(s.latitude), lng: Number(s.longitude),
      _key: `stop_${s.id}`,
    }));
    const placeItems = (placesRes.value?.data || []).map(p => ({
      type: 'place',
      label: p.label,
      sub: 'Address',
      lat: p.lat, lng: p.lng,
      _key: `place_${p.placeId}`,
    }));
    combined.value = [...stops, ...placeItems];
  } catch {
    combined.value = [];
  } finally {
    loading.value = false;
  }
}

function fmt(name = '') {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  return isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
}
function fmtName(ep) {
  if (!ep) return '';
  return fmt(ep.stop_name || ep.name || ep.label || '');
}
function displayName(ep) { return ep?.stop_name || ep?.name || ep?.label || ''; }

function assign(ep) {
  // Normalize into journeyStore endpoint shape.
  const norm = ep.type === 'place'
    ? { type: 'place', label: ep.label, name: fmt(ep.label), lat: ep.lat, lng: ep.lng }
    : { type: 'stop', stopId: ep.stopId || ep.id, id: ep.stopId || ep.id, stop_name: ep.label, name: fmt(ep.label), lat: ep.lat, lng: ep.lng };

  // If we're choosing a place to save as Home/Work, store it instead of routing.
  if (pendingSlot.value) {
    places.setSlot(pendingSlot.value, norm);
    pendingSlot.value = null;
    resetSearch();
    return;
  }

  if (activeField.value === 'origin') {
    journeyStore.setOrigin(norm);
    if (!journeyStore.destination) { activeField.value = 'destination'; resetSearch(); nextTick(() => inputRef.value?.focus()); return; }
  } else {
    journeyStore.setDestination(norm);
  }
  resetSearch();
  if (journeyStore.origin && journeyStore.destination) activeField.value = null;
}
function select(item) { assign(item); }

function resetSearch() { searchQ.value = ''; combined.value = []; }

function pickSaved(slot) {
  const p = places[slot];
  if (!p) {
    // Not set yet → enter "choose a place" mode; next selection saves the slot.
    pendingSlot.value = slot;
    nextTick(() => inputRef.value?.focus());
    return;
  }
  assign(p);
}

function useMyLocation() {
  if (!canUseLocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => assign({ type: 'place', label: 'My location', lat: pos.coords.latitude, lng: pos.coords.longitude }),
    ()  => alert('Could not get your location'),
    { enableHighAccuracy: true, timeout: 8000 },
  );
}

function rerun(h) {
  journeyStore.setOrigin(h.from);
  journeyStore.setDestination(h.to);
  activeField.value = null;
  doSearch();
}

function setMode(mode) {
  timeMode.value = mode;
  if (mode !== 'now' && !timeVal.value) {
    const n = new Date();
    timeVal.value = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  }
  journeyStore.setTimeMode(mode, timeVal.value);
}

function swap() { journeyStore.swap(); resetSearch(); }

async function doSearch() {
  await journeyStore.search();
  if (!journeyStore.error) router.push('/results');
}

onMounted(() => nextTick(() => inputRef.value?.focus()));
</script>

<style scoped>
.planner { background: var(--color-bg); }

.planner-header { display: flex; align-items: flex-start; gap: 10px; padding: 16px 16px 8px; }
.back-btn { width: 40px; height: 40px; border-radius: 50%; background: var(--color-surface); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; box-shadow: var(--shadow-sm); }
.back-btn svg { width: 20px; height: 20px; }
.planner-fields { flex: 1; padding: 8px; }
.pf-row { display: flex; align-items: center; gap: 12px; padding: 12px 10px; border-radius: var(--radius-md); cursor: pointer; transition: background 0.15s; min-height: 52px; }
.pf-row.active { background: #EFF6FF; }
.pf-row:hover  { background: var(--color-bg); }
.pf-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.pf-dot.from { background: var(--color-primary); }
.pf-dot.to   { background: var(--color-danger); }
.pf-info { flex: 1; min-width: 0; }
.pf-label { display: block; font-size: 10px; font-weight: 700; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.pf-val { display: block; font-size: 14px; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pf-val.muted { color: var(--color-muted); font-weight: 400; }
.clear-x { font-size: 13px; color: var(--color-muted); padding: 4px; flex-shrink: 0; }
.pf-divider { display: flex; align-items: center; justify-content: flex-end; padding: 0 10px; }
.swap-btn { width: 28px; height: 28px; border-radius: 50%; background: var(--color-border); display: flex; align-items: center; justify-content: center; transition: background 0.15s, transform 0.2s; }
.swap-btn:hover { background: var(--color-primary); color: #fff; transform: rotate(180deg); }

/* Time bar */
.time-bar { display: flex; align-items: center; gap: 8px; padding: 4px 16px 6px; flex-wrap: wrap; }
.time-modes { display: flex; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 20px; padding: 3px; gap: 2px; }
.time-modes button { font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 16px; color: var(--color-muted); white-space: nowrap; }
.time-modes button.on { background: var(--color-primary); color: #fff; }
.time-input { border: 1px solid var(--color-border); border-radius: 12px; padding: 7px 10px; font-size: 13px; font-family: inherit; background: var(--color-surface); color: var(--color-text); }

/* Search input */
.search-box { padding: 8px 16px; }
.search-input-wrap { display: flex; align-items: center; gap: 10px; background: var(--color-surface); border: 2px solid var(--color-border); border-radius: var(--radius-md); padding: 0 14px; transition: border-color 0.18s; }
.search-input-wrap:focus-within { border-color: var(--color-primary); }
.search-icon { width: 18px; height: 18px; color: var(--color-muted); flex-shrink: 0; }
.search-input { flex: 1; border: none; outline: none; background: transparent; font-size: 15px; font-family: inherit; padding: 14px 0; color: var(--color-text); }
.search-input::placeholder { color: var(--color-muted); }

/* Quick picks */
.quick-grid { display: flex; gap: 8px; padding: 6px 0 10px; flex-wrap: wrap; }
.quick-chip { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 14px; background: var(--color-surface); border: 1px solid var(--color-border); font-size: 13px; font-weight: 600; cursor: pointer; }
.quick-chip:hover { border-color: var(--color-primary); }
.qc-ic { font-size: 16px; }
.qc-txt { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.recent-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-muted); margin: 6px 2px; }
.recent-clear { font-size: 11px; color: var(--color-primary); font-weight: 700; }

/* Results */
.results-area { flex: 1; padding: 4px 16px; overflow-y: auto; }
.stop-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 12px; margin-bottom: 4px; border-radius: 12px; background: var(--color-surface); border: 1px solid var(--color-border); text-align: left; cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.stop-row:hover { background: #F0FDFC; border-color: var(--color-primary); }
.stop-row__icon { font-size: 20px; }
.stop-row__info { flex: 1; min-width: 0; }
.stop-row__name { display: block; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stop-row__code { display: block; font-size: 12px; margin-top: 2px; }
.stop-row__arrow { width: 16px; height: 16px; color: var(--color-muted); flex-shrink: 0; }
.empty-state { text-align: center; padding: 48px 20px; }
.empty-icon { font-size: 40px; margin-bottom: 12px; }
.empty-state p { margin-bottom: 4px; font-size: 14px; }
.hint { text-align: center; padding: 28px 20px; }
.hint p { font-size: 14px; }

/* CTA */
.planner-cta { padding: 12px 16px 16px; border-top: 1px solid var(--color-border); background: var(--color-surface); }
.cta-route { font-size: 12px; text-align: center; margin-top: 8px; }
</style>
