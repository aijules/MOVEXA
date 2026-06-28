import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

// Saved places (Home / Work / custom favourites) and recent-search history.
// Persisted to localStorage so they survive reloads and work offline. When user
// auth is wired up later, these can be synced to the account.
const PLACES_KEY  = 'movexa_places';
const HISTORY_KEY = 'movexa_search_history';
const HISTORY_MAX = 8;

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}

// A "place" is a normalized endpoint: { type:'stop'|'place', id?, label, lat, lng, stopId? }
function placeKey(p) {
  if (!p) return '';
  if (p.stopId || p.id) return `stop:${p.stopId || p.id}`;
  return `geo:${Number(p.lat).toFixed(4)},${Number(p.lng).toFixed(4)}`;
}

export const usePlacesStore = defineStore('places', () => {
  const places  = ref(load(PLACES_KEY, []));   // [{ slot:'home'|'work'|null, ...place }]
  const history = ref(load(HISTORY_KEY, []));   // [{ from, to, at }]

  const home = computed(() => places.value.find(p => p.slot === 'home') || null);
  const work = computed(() => places.value.find(p => p.slot === 'work') || null);
  const favourites = computed(() => places.value.filter(p => !p.slot));

  function persist() { save(PLACES_KEY, places.value); }

  // Set/replace the Home or Work shortcut.
  function setSlot(slot, place) {
    places.value = places.value.filter(p => p.slot !== slot);
    if (place) places.value.unshift({ ...place, slot });
    persist();
  }

  function addFavourite(place) {
    if (!place) return;
    const k = placeKey(place);
    if (places.value.some(p => !p.slot && placeKey(p) === k)) return;
    places.value.push({ ...place, slot: null });
    persist();
  }

  function removePlace(place) {
    const k = placeKey(place);
    places.value = places.value.filter(p => placeKey(p) !== k || p.slot);
    persist();
  }

  function isFavourite(place) {
    const k = placeKey(place);
    return places.value.some(p => placeKey(p) === k);
  }

  // Record a completed search so it can be re-run from Home/Planner.
  function addHistory(from, to) {
    if (!from || !to) return;
    const entry = { from, to, at: Date.now() };
    const k = `${placeKey(from)}>${placeKey(to)}`;
    history.value = [entry, ...history.value.filter(h => `${placeKey(h.from)}>${placeKey(h.to)}` !== k)].slice(0, HISTORY_MAX);
    save(HISTORY_KEY, history.value);
  }

  function clearHistory() {
    history.value = [];
    save(HISTORY_KEY, history.value);
  }

  return {
    places, history, home, work, favourites,
    setSlot, addFavourite, removePlace, isFavourite,
    addHistory, clearHistory, placeKey,
  };
});
