<template>
  <div class="page saved">
    <div class="page-header">
      <h2>Saved Journeys</h2>
      <div class="online-dot" :class="appStore.isOnline ? 'online' : 'offline'" :title="appStore.isOnline ? 'Online' : 'Offline'"></div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="saved-body">
      <div v-for="i in 3" :key="i" class="skeleton" style="height:88px;border-radius:14px;margin-bottom:8px"></div>
    </div>

    <!-- Journeys -->
    <div v-else-if="savedJourneys.length" class="saved-body">
      <TransitionGroup name="list" tag="div">
        <div v-for="j in savedJourneys" :key="j.id" class="saved-card card card-hover">
          <div class="sc-left">
            <div class="sc-route-dot" :style="{ background: j.journey_data?.routeColor || '#0EA5A3' }"></div>
          </div>
          <div class="sc-content" @click="replayJourney(j)">
            <p class="sc-route">{{ j.journey_data?.routeCode || 'Route' }}</p>
            <p class="sc-stops">{{ cleanName(j.from_stop_name) }} → {{ cleanName(j.to_stop_name) }}</p>
            <p class="sc-date text-muted">Saved {{ fmtDate(j.created_at) }}</p>
          </div>
          <button class="sc-remove" @click="removeJourney(j.id)" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </TransitionGroup>
    </div>

    <!-- Empty -->
    <div v-else class="empty-state">
      <div class="empty-icon">🔖</div>
      <h3>No saved journeys</h3>
      <p class="text-muted">Plan a journey and tap Save to keep it here.</p>
      <router-link to="/planner" class="btn btn-primary" style="margin-top:20px">Plan a journey</router-link>
    </div>

    <!-- Quick links -->
    <div class="quick-section">
      <p class="section-title">Quick Access</p>
      <div class="quick-links">
        <router-link to="/nearby" class="quick-link card">
          <span class="ql-icon">📍</span><span>Nearby Stops</span>
        </router-link>
        <router-link to="/alerts" class="quick-link card">
          <span class="ql-icon">🔔</span>
          <span>Alerts<span v-if="appStore.alerts.length" class="ql-badge">{{ appStore.alerts.length }}</span></span>
        </router-link>
        <router-link to="/profile" class="quick-link card">
          <span class="ql-icon">👤</span><span>Profile</span>
        </router-link>
        <router-link to="/map" class="quick-link card">
          <span class="ql-icon">🗺️</span><span>Live Map</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore }       from '../stores/appStore';
import { useJourneyStore }   from '../stores/journeyStore';
import { savedJourneysApi }  from '../services/api';

const router       = useRouter();
const appStore     = useAppStore();
const journeyStore = useJourneyStore();

const savedJourneys = ref([]);
const loading       = ref(false);

async function fetchSaved() {
  loading.value = true;
  try {
    const res = await savedJourneysApi.getAll();
    savedJourneys.value = res.data || [];
  } catch {
    savedJourneys.value = [];
  } finally {
    loading.value = false;
  }
}

async function removeJourney(id) {
  await savedJourneysApi.remove(id).catch(() => {});
  savedJourneys.value = savedJourneys.value.filter(j => j.id !== id);
}

function replayJourney(saved) {
  const jd = saved.journey_data;
  if (jd) {
    journeyStore.setOrigin({ id: saved.from_stop_id, stop_name: saved.from_stop_name, name: saved.from_stop_name });
    journeyStore.setDestination({ id: saved.to_stop_id, stop_name: saved.to_stop_name, name: saved.to_stop_name });
    journeyStore.selectJourney(jd);
    router.push(`/journey/${jd.journeyId || '1'}`);
  } else {
    journeyStore.setOrigin({ stop_name: saved.from_stop_name, name: saved.from_stop_name });
    journeyStore.setDestination({ stop_name: saved.to_stop_name, name: saved.to_stop_name });
    router.push('/planner');
  }
}

function cleanName(name = '') {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  const last  = parts[parts.length - 1];
  const isCode = /^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1;
  const clean = isCode ? parts.slice(0, -1).join(' ') : parts.join(' ');
  return clean.length > 20 ? clean.slice(0, 19) + '…' : clean;
}

function fmtDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleDateString('en-RW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

onMounted(fetchSaved);
</script>

<style scoped>
.saved { background: var(--color-bg); }
.page-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 20px 16px; }
h2 { font-size: 24px; }
.online-dot { width: 10px; height: 10px; border-radius: 50%; }
.online-dot.online  { background: var(--color-accent-green); }
.online-dot.offline { background: var(--color-danger); }

.saved-body { padding: 0 16px; }

.saved-card { display: flex; align-items: center; gap: 12px; padding: 14px; margin-bottom: 8px; cursor: pointer; }
.sc-left { flex-shrink: 0; }
.sc-route-dot { width: 36px; height: 36px; border-radius: 10px; }
.sc-content { flex: 1; min-width: 0; }
.sc-route { font-size: 12px; font-weight: 700; color: var(--color-primary); text-transform: uppercase; letter-spacing: 0.06em; }
.sc-stops { font-size: 14px; font-weight: 600; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-date  { font-size: 11px; }
.sc-remove { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); color: var(--color-muted); flex-shrink: 0; transition: background 0.15s, color 0.15s; }
.sc-remove:hover { background: #FEE2E2; color: var(--color-danger); }
.sc-remove svg { width: 16px; height: 16px; }

.empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
h3 { font-size: 20px; margin-bottom: 8px; }

.quick-section { padding: 16px 20px; }
.quick-links { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.quick-link { display: flex; align-items: center; gap: 10px; padding: 14px 16px; font-weight: 600; font-size: 14px; }
.ql-icon { font-size: 20px; }
.ql-badge { display: inline-flex; align-items: center; justify-content: center; background: var(--color-danger); color: white; width: 16px; height: 16px; border-radius: 50%; font-size: 10px; margin-left: 4px; }
</style>
