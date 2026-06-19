import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { alertsApi, adminApi } from '../services/api';

export const useAppStore = defineStore('app', () => {
  const alerts = ref([]);
  const isOnline = ref(navigator.onLine);
  const dataHealth = ref(null);
  const loadingAlerts = ref(false);

  window.addEventListener('online', () => { isOnline.value = true; });
  window.addEventListener('offline', () => { isOnline.value = false; });

  async function fetchAlerts() {
    loadingAlerts.value = true;
    try {
      const res = await alertsApi.getAll();
      alerts.value = res.data || [];
    } catch {
      alerts.value = [];
    } finally {
      loadingAlerts.value = false;
    }
  }

  async function fetchDataHealth() {
    try {
      const res = await adminApi.dataHealth();
      dataHealth.value = res.data;
    } catch {
      dataHealth.value = null;
    }
  }

  return { alerts, isOnline, dataHealth, loadingAlerts, fetchAlerts, fetchDataHealth };
});
