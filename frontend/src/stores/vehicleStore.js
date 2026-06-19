import { defineStore } from 'pinia';
import { ref } from 'vue';
import { vehiclesApi } from '../services/api';

export const useVehicleStore = defineStore('vehicles', () => {
  const liveVehicles = ref([]);
  const loading = ref(false);
  let pollInterval = null;

  async function fetchLive(routeId = null) {
    loading.value = true;
    try {
      const res = routeId
        ? await vehiclesApi.getByRoute(routeId)
        : await vehiclesApi.getLive();
      liveVehicles.value = res.data || [];
    } catch {
      // keep existing data on error
    } finally {
      loading.value = false;
    }
  }

  function startPolling(routeId = null, intervalMs = 5000) {
    stopPolling();
    fetchLive(routeId);
    pollInterval = setInterval(() => fetchLive(routeId), intervalMs);
  }

  function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  // Legacy socket compat (no-op now, polling replaces it)
  function startRealtime() { startPolling(); }
  function stopRealtime()  { stopPolling(); }

  return { liveVehicles, loading, fetchLive, startPolling, stopPolling, startRealtime, stopRealtime };
});
