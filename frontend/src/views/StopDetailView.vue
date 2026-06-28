<template>
  <div class="page">
    <div class="screen-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Stop Details</h2>
    </div>

    <div v-if="stopsStore.loading" class="detail-body">
      <div class="skeleton" style="height:80px;border-radius:16px;margin-bottom:12px"></div>
      <div class="skeleton" style="height:200px;border-radius:16px"></div>
    </div>

    <div v-else-if="stopsStore.error" class="empty-state">
      <p>{{ stopsStore.error }}</p>
    </div>

    <div v-else-if="stopsStore.selectedStop" class="detail-body">
      <div class="stop-card card">
        <div class="stop-card__icon">🚏</div>
        <div>
          <h3>{{ stopName }}</h3>
          <p class="text-muted">{{ stopsStore.selectedStop.stop_code || stopsStore.selectedStop.code || 'Bus stop' }}</p>
        </div>
      </div>

      <div class="departures-card card">
        <div class="section-header">
          <p class="section-title">Upcoming Departures</p>
          <button class="btn btn-ghost" style="font-size:13px;padding:4px 8px" @click="refresh">Refresh</button>
        </div>

        <div v-if="stopsStore.loading">
          <div v-for="i in 4" :key="i" class="skeleton" style="height:56px;border-radius:10px;margin-bottom:8px"></div>
        </div>

        <div v-else-if="stopsStore.departures.length === 0" class="empty-deps">
          <p class="text-muted">No upcoming departures</p>
        </div>

        <div v-else class="departures-list">
          <div v-for="(dep, i) in stopsStore.departures" :key="dep.id || i" class="departure-row">
            <div class="dep-badge" :style="{ background: dep.routes?.color || '#0EA5A3' }">
              {{ dep.routes?.route_code || '?' }}
            </div>
            <div class="dep-info">
              <p class="dep-head">{{ dep.routes?.route_name || 'Route' }}</p>
            </div>
            <div class="dep-time">
              <span class="dep-scheduled">{{ dep.departure_time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStopsStore } from '../stores/stopsStore';

const route = useRoute();
const router = useRouter();
const stopsStore = useStopsStore();

const stopName = computed(() => {
  const s = stopsStore.selectedStop;
  if (!s) return '';
  const raw = s.stop_name || s.name || '';
  const parts = raw.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  return (/^[A-Z0-9]{3,8}$/.test(last) && parts.length > 1) ? parts.slice(0, -1).join(' ') : raw;
});

async function load() {
  await stopsStore.fetchStop(route.params.id);
  await stopsStore.fetchDepartures(route.params.id);
}

function refresh() {
  stopsStore.fetchDepartures(route.params.id);
}

onMounted(load);
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); }
.back-btn svg { width: 20px; height: 20px; }
.detail-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.stop-card { display: flex; align-items: center; gap: 16px; padding: 16px 20px; }
.stop-card__icon { font-size: 32px; }
.stop-card h3 { font-size: 20px; }

.departures-card { padding: 16px; }
.section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }

.departures-list { display: flex; flex-direction: column; gap: 8px; }
.departure-row { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--color-bg); border-radius: 10px; }
.dep-badge { padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 800; color: white; flex-shrink: 0; }
.dep-info { flex: 1; }
.dep-head { font-size: 14px; font-weight: 600; }
.dep-time { text-align: right; }
.dep-scheduled { font-size: 18px; font-weight: 800; font-family: var(--font-heading); color: var(--color-text); display: block; }
.dep-delay { font-size: 12px; }
.empty-deps { text-align: center; padding: 24px; }
.empty-state { text-align: center; padding: 60px 20px; color: var(--color-muted); }
</style>
