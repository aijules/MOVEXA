import { defineStore } from 'pinia';
import { ref } from 'vue';
import { stopsApi } from '../services/api';

export const useStopsStore = defineStore('stops', () => {
  const nearbyStops = ref([]);
  const searchResults = ref([]);
  const selectedStop = ref(null);
  const departures = ref([]);
  const loading = ref(false);
  const error = ref(null);

  async function fetchNearby(lat, lng, radius = 1000) {
    loading.value = true;
    error.value = null;
    try {
      const res = await stopsApi.nearby(lat, lng, radius);
      nearbyStops.value = (res.data || []).map(s => ({ ...s, _id: s.id, name: s.stop_name }));
    } catch (e) {
      error.value = e.message;
      nearbyStops.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function searchStops(q) {
    if (!q || q.length < 2) { searchResults.value = []; return; }
    loading.value = true;
    try {
      const res = await stopsApi.search(q, 15);
      searchResults.value = (res.data || []).map(s => ({ ...s, _id: s.id, name: s.stop_name }));
    } catch {
      searchResults.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function fetchStop(id) {
    loading.value = true;
    error.value = null;
    try {
      const res = await stopsApi.getById(id);
      selectedStop.value = res.data;
    } catch (e) {
      error.value = e.message;
      selectedStop.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDepartures(stopId) {
    loading.value = true;
    try {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const res = await stopsApi.getDepartures(stopId, time);
      departures.value = res.data || [];
    } catch {
      departures.value = [];
    } finally {
      loading.value = false;
    }
  }

  return { nearbyStops, searchResults, selectedStop, departures, loading, error, fetchNearby, searchStops, fetchStop, fetchDepartures };
});
