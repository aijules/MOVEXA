<template>
  <div class="page">
    <div class="screen-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Nearby Stops</h2>
    </div>

    <div class="nearby-body">
      <button class="btn btn-outline btn-full" @click="getLocation" :disabled="loading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        {{ loading ? 'Finding location...' : 'Use my location' }}
      </button>

      <div v-if="stopsStore.loading" class="stops-list">
        <div v-for="i in 5" :key="i" class="skeleton" style="height:72px;border-radius:14px;margin-bottom:10px"></div>
      </div>

      <div v-else-if="stopsStore.nearbyStops.length === 0 && searched" class="empty-state">
        <div class="empty-icon">📍</div>
        <p>No stops found near your location</p>
      </div>

      <div v-else class="stops-list">
        <router-link
          v-for="stop in stopsStore.nearbyStops"
          :key="stop.id || stop._id"
          :to="`/stops/${stop.id || stop._id}`"
          class="stop-row card card-hover"
        >
          <div class="stop-row__left">
            <div class="stop-icon">🚏</div>
            <div>
              <p class="stop-name">{{ cleanName(stop.stop_name || stop.name) }}</p>
              <p class="stop-code text-muted">{{ stop.stop_code || 'Bus stop' }}</p>
            </div>
          </div>
          <div class="stop-dist" v-if="stop.distance_meters">
            {{ formatDist(stop.distance_meters) }}
          </div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useStopsStore } from '../stores/stopsStore';

const router = useRouter();
const stopsStore = useStopsStore();
const loading = ref(false);
const searched = ref(false);

function formatDist(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

function cleanName(name = '') {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return (/^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1) ? parts.slice(0, -1).join(' ') : name;
}

function getLocation() {
  if (!navigator.geolocation) return;
  loading.value = true;
  navigator.geolocation.getCurrentPosition(async pos => {
    await stopsStore.fetchNearby(pos.coords.latitude, pos.coords.longitude);
    searched.value = true;
    loading.value = false;
  }, () => { loading.value = false; });
}
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); }
.back-btn svg { width: 20px; height: 20px; }
.nearby-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.stops-list { display: flex; flex-direction: column; gap: 0; }
.stop-row { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; margin-bottom: 10px; }
.stop-row__left { display: flex; align-items: center; gap: 12px; }
.stop-icon { font-size: 24px; }
.stop-name { font-weight: 700; font-size: 15px; }
.stop-code { font-size: 12px; margin-top: 2px; }
.stop-dist { font-size: 13px; font-weight: 700; color: var(--color-primary); }
.empty-state { text-align: center; padding: 48px 20px; color: var(--color-muted); }
.empty-icon { font-size: 40px; margin-bottom: 12px; }
</style>
