<template>
  <div class="page">
    <div class="page-header" :style="{ borderColor: linesStore.selectedLine?.color }">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <div class="line-badge-lg" v-if="linesStore.selectedLine" :style="{ background: linesStore.selectedLine.color }">
        {{ linesStore.selectedLine.shortName }}
      </div>
      <h2>Route {{ linesStore.selectedLine?.shortName || '' }}</h2>
    </div>

    <div v-if="linesStore.loading" class="detail-body">
      <div v-for="i in 6" :key="i" class="skeleton" style="height:56px;border-radius:12px;margin-bottom:8px"></div>
    </div>

    <div v-else class="detail-body">
      <div class="stops-section card">
        <p class="section-title">All Stops ({{ linesStore.lineStops.length }})</p>
        <div class="stops-timeline">
          <div v-for="(stop, i) in linesStore.lineStops" :key="stop._id || i" class="stop-tl-item">
            <div class="stl-icon">
              <div class="stl-dot" :style="{ background: linesStore.selectedLine?.color || '#0EA5A3' }"></div>
              <div class="stl-line" v-if="i < linesStore.lineStops.length - 1" :style="{ background: linesStore.selectedLine?.color || '#0EA5A3', opacity: 0.25 }"></div>
            </div>
            <router-link :to="`/stops/${stop._id}`" class="stl-content">
              <span class="stl-name">{{ stop.name }}</span>
              <span class="stl-dist text-muted" v-if="stop.distanceFromStartKm">{{ stop.distanceFromStartKm?.toFixed(1) }} km</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLinesStore } from '../stores/linesStore';

const route = useRoute();
const router = useRouter();
const linesStore = useLinesStore();

onMounted(() => linesStore.fetchLine(route.params.id));
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 3px solid var(--color-primary); }
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); }
.back-btn svg { width: 20px; height: 20px; }
.line-badge-lg { padding: 6px 14px; border-radius: 10px; font-size: 16px; font-weight: 800; color: white; }
.detail-body { padding: 16px; }

.stops-section { padding: 16px; }
.stops-timeline { display: flex; flex-direction: column; }
.stop-tl-item { display: flex; gap: 12px; }
.stl-icon { display: flex; flex-direction: column; align-items: center; width: 16px; flex-shrink: 0; }
.stl-dot { width: 12px; height: 12px; border-radius: 50%; margin-top: 4px; border: 2px solid white; box-shadow: 0 0 0 2px currentColor; }
.stl-line { width: 2px; flex: 1; min-height: 28px; margin: 2px 0; }
.stl-content { display: flex; justify-content: space-between; align-items: center; flex: 1; padding: 6px 0 14px; font-size: 14px; }
.stl-name { font-weight: 600; }
.stl-dist { font-size: 12px; }
</style>
