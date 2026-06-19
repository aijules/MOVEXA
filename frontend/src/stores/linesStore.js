import { defineStore } from 'pinia';
import { ref } from 'vue';
import { routesApi } from '../services/api';

// Updated to use /api/routes — "lines" name kept for backward compat
export const useLinesStore = defineStore('lines', () => {
  const lines = ref([]);
  const selectedLine = ref(null);
  const lineStops = ref([]);
  const linePath = ref(null);
  const loading = ref(false);
  const error = ref(null);

  async function fetchLines() {
    if (lines.value.length > 0) return;
    loading.value = true;
    try {
      const res = await routesApi.getAll();
      lines.value = (res.data || []).map(r => ({
        ...r,
        _id: r.id,
        shortName: r.route_code,
        longName: r.route_name,
        color: r.color || '#0EA5A3',
        textColor: r.text_color || '#FFFFFF',
      }));
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchLine(id) {
    loading.value = true;
    error.value = null;
    try {
      const [routeRes, stopsRes, pathRes] = await Promise.all([
        routesApi.getById(id),
        routesApi.getStops(id),
        routesApi.getPath(id),
      ]);
      const route = routeRes.data;
      selectedLine.value = { ...route, _id: route.id, shortName: route.route_code, longName: route.route_name, color: route.color };
      lineStops.value = (stopsRes.data || []).map(s => ({ ...s, _id: s.id, name: s.stop_name, distanceFromStartKm: s.distance_from_start_km }));
      linePath.value = pathRes.data?.coordinates?.length ? { type: 'LineString', coordinates: pathRes.data.coordinates } : null;
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  return { lines, selectedLine, lineStops, linePath, loading, error, fetchLines, fetchLine };
});
