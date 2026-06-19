import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { journeysApi } from '../services/api';
import { usePlacesStore } from './placesStore';

export const useJourneyStore = defineStore('journey', () => {
  const origin      = ref(null);
  const destination = ref(null);
  const results     = ref([]);
  const selectedJourney = ref(null);
  const loading  = ref(false);
  const error    = ref(null);
  const searched = ref(false);

  // Jakdojade-style time + sort controls.
  const timeMode = ref('now');          // 'now' | 'depart' | 'arrive'
  const time     = ref('');             // 'HH:MM' when timeMode !== 'now'
  const sort     = ref('best');         // best | fastest | fewest_changes | least_walking

  function setOrigin(stop)       { origin.value = stop; }
  function setDestination(stop)  { destination.value = stop; }
  function selectJourney(j)      { selectedJourney.value = j; }
  function clearResults()        { results.value = []; searched.value = false; error.value = null; }
  function setTimeMode(mode, t)  { timeMode.value = mode; time.value = t || ''; }
  function setSort(s)            { sort.value = s; }

  // Build the GET params for one endpoint (stop or geocoded place).
  function endpointParams(ep, prefix) {
    const name = ep?.stop_name || ep?.name || ep?.label || '';
    const p = {};
    if (prefix) p[prefix] = name; // 'from' or 'to'
    if (ep?.type === 'place' && Number.isFinite(ep.lat) && Number.isFinite(ep.lng)) {
      p[`${prefix}Lat`] = ep.lat;
      p[`${prefix}Lng`] = ep.lng;
    }
    return p;
  }

  async function search() {
    if (!origin.value || !destination.value) {
      error.value = 'Please select origin and destination';
      return;
    }

    loading.value = true;
    error.value   = null;
    results.value = [];
    searched.value = false;

    try {
      const params = {
        ...endpointParams(origin.value, 'from'),
        ...endpointParams(destination.value, 'to'),
        sort: sort.value,
      };
      if (timeMode.value !== 'now' && time.value) {
        params.time = time.value;
        params.mode = timeMode.value; // 'depart' | 'arrive'
      }
      const from = params.from; const to = params.to;
      delete params.from; delete params.to;

      const res = await journeysApi.searchGET(from, to, params);
      results.value  = res.data || [];
      searched.value = true;

      // Record to history on a successful, non-empty search.
      if (results.value.length) {
        try { usePlacesStore().addHistory(origin.value, destination.value); } catch { /* ignore */ }
      }
    } catch (e) {
      const networkFailure = /network|timeout|failed to fetch|cors/i.test(e.message || '');
      error.value    = networkFailure
        ? 'MOVEXA could not reach the route service. The server may be waking up—wait a moment and try again.'
        : (e.message || 'Journey search failed. Please try again.');
      searched.value = true;
    } finally {
      loading.value = false;
    }
  }

  // Re-sort existing results client-side without a round-trip when possible.
  async function changeSort(s) {
    sort.value = s;
    if (searched.value) await search();
  }

  function swap() {
    const tmp = origin.value;
    origin.value = destination.value;
    destination.value = tmp;
  }

  function stopDisplayName(stop) {
    if (!stop) return '';
    return stop.stop_name || stop.name || stop.label || '';
  }

  const originName      = computed(() => stopDisplayName(origin.value));
  const destinationName = computed(() => stopDisplayName(destination.value));

  return {
    origin, destination, results, selectedJourney,
    loading, error, searched,
    timeMode, time, sort,
    originName, destinationName,
    setOrigin, setDestination, selectJourney, clearResults, search, swap,
    setTimeMode, setSort, changeSort,
  };
});
