<template>
  <div class="page">
    <div class="screen-header">
      <button class="back-btn" @click="router.back()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      </button>
      <h2>Service Alerts</h2>
    </div>

    <div class="alerts-body">
      <div v-if="appStore.loadingAlerts">
        <div v-for="i in 3" :key="i" class="skeleton" style="height:80px;border-radius:16px;margin-bottom:10px"></div>
      </div>

      <div v-else-if="appStore.alerts.length === 0" class="empty-state">
        <div class="empty-icon">✅</div>
        <h3>No Active Alerts</h3>
        <p class="text-muted">All services are running normally.</p>
      </div>

      <div v-else>
        <div v-for="alert in appStore.alerts" :key="alert._id" class="alert-item card" :class="`alert-item--${alert.severity}`">
          <div class="alert-item__top">
            <span class="alert-sev-badge" :class="alert.severity">{{ alert.severity.toUpperCase() }}</span>
            <span class="alert-time text-muted">{{ formatDate(alert.startsAt) }}</span>
          </div>
          <h4 class="alert-title">{{ alert.title }}</h4>
          <p class="alert-msg text-muted">{{ alert.message }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAppStore } from '../stores/appStore';

const router = useRouter();
const appStore = useAppStore();

function formatDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-RW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
</script>

<style scoped>
.page-header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--color-border); }
.back-btn { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--color-bg); }
.back-btn svg { width: 20px; height: 20px; }
.alerts-body { padding: 16px; display: flex; flex-direction: column; gap: 10px; }

.alert-item { padding: 16px; border-left: 4px solid; }
.alert-item--info { border-color: var(--color-accent-blue); background: #EFF6FF; }
.alert-item--warning { border-color: var(--color-warning); background: #FFFBEB; }
.alert-item--critical { border-color: var(--color-danger); background: #FEF2F2; }

.alert-item__top { display: flex; justify-content: space-between; margin-bottom: 8px; }
.alert-sev-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; }
.alert-sev-badge.info { background: var(--color-accent-blue); color: #fff; }
.alert-sev-badge.warning { background: var(--color-warning); color: #fff; }
.alert-sev-badge.critical { background: var(--color-danger); color: #fff; }
.alert-time { font-size: 12px; }
.alert-title { font-size: 15px; margin-bottom: 4px; }
.alert-msg { font-size: 13px; }

.empty-state { text-align: center; padding: 60px 20px; }
.empty-icon { font-size: 48px; margin-bottom: 16px; }
.empty-state h3 { font-size: 20px; margin-bottom: 8px; }
</style>
