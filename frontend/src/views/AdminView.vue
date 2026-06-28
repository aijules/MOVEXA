<template>
  <div class="page">
    <div class="page-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Admin Data Panel</h2>
    </div>

    <div class="admin-body">
      <button class="btn btn-outline btn-full" @click="refresh" :disabled="loading">
        {{ loading ? 'Loading...' : 'Refresh Data' }}
      </button>

      <div v-if="loading">
        <div v-for="i in 6" :key="i" class="skeleton" style="height:56px;border-radius:12px;margin-bottom:8px"></div>
      </div>

      <div v-else-if="!health" class="empty-state card">
        <p class="text-muted text-center">Could not connect to backend. Make sure the server is running.</p>
        <p class="text-muted text-center" style="font-size:12px;margin-top:8px">Check the configured MOVEXA backend at /api/health.</p>
      </div>

      <div v-else>
        <div class="health-grid">
          <div class="health-card card" v-for="item in healthItems" :key="item.label">
            <p class="hc-value">{{ item.value }}</p>
            <p class="hc-label text-muted">{{ item.label }}</p>
          </div>
        </div>

        <div class="card" style="padding:16px;margin-top:4px" v-if="health.lastImport">
          <p class="section-title">Last Import</p>
          <div class="import-info">
            <span class="imp-type">{{ health.lastImport.type }}</span>
            <span class="imp-status" :class="health.lastImport.status">{{ health.lastImport.status }}</span>
          </div>
          <p class="text-muted" style="font-size:12px;margin-top:8px">
            Warnings: {{ health.lastImport.warnings }} | Errors: {{ health.lastImport.errors }}
          </p>
        </div>

        <div class="seed-instructions card">
          <p class="section-title">Import Commands</p>
          <div class="cmd-block" v-for="cmd in commands" :key="cmd">
            <code>{{ cmd }}</code>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../services/api';

const router = useRouter();
const loading = ref(false);
const health = ref(null);

const healthItems = computed(() => health.value ? [
  { label: 'Stops', value: health.value.stops },
  { label: 'Lines', value: health.value.lines },
  { label: 'Route Patterns', value: health.value.routePatterns },
  { label: 'Real Paths', value: health.value.routePatternsWithRealPath },
  { label: 'Fallback Paths', value: health.value.routePatternsWithFallbackPath },
  { label: 'Vehicles', value: health.value.vehicles },
  { label: 'Trips Today', value: health.value.trips },
  { label: 'Stop Times', value: health.value.stopTimes },
] : []);

const commands = [
  'cd backend',
  'npm run seed:routes-stops',
  'npm run seed:route-paths',
  'npm run seed:ecofleet',
  'npm run generate:schedules',
  'npm run validate:data',
];

async function refresh() {
  loading.value = true;
  try {
    const res = await adminApi.dataHealth();
    health.value = res.data;
  } catch {
    health.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); }
.back-btn svg { width: 20px; height: 20px; }
.admin-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.health-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
.health-card { padding: 14px 16px; }
.hc-value { font-size: 28px; font-weight: 800; font-family: var(--font-heading); color: var(--color-primary); }
.hc-label { font-size: 12px; margin-top: 2px; }

.import-info { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.imp-type { font-weight: 700; font-size: 14px; }
.imp-status { padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.imp-status.completed { background: #DCFCE7; color: #16A34A; }
.imp-status.running { background: #FEF9C3; color: #CA8A04; }
.imp-status.failed { background: #FEE2E2; color: #DC2626; }

.seed-instructions { padding: 16px; }
.cmd-block { margin-top: 6px; }
code { background: var(--color-bg); display: block; padding: 8px 12px; border-radius: 8px; font-size: 13px; color: var(--color-primary); border: 1px solid var(--color-border); }

.empty-state { padding: 32px 20px; }
</style>
