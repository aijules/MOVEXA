import { computed } from 'vue';

/**
 * Shared real-clock, service-aware bus-progress model.
 * Route + stops are real data; the bus position is derived from the actual time
 * and the dataset's per-stop timings (scaled to the journey's duration), so the
 * Navigate screen, the journey-detail stop list, and the live map all behave the
 * same way: buses only run 05:00–22:00, take real minutes between stops, and the
 * countdown starts only once the bus has actually departed your pickup.
 *
 * @param {Object}   opts
 * @param {Ref}      opts.journey    selected journey (with summary, fromStop, toStop)
 * @param {Ref<Array>} opts.routeStops ordered route stops (id, latitude, longitude, estimated_minutes_from_start)
 * @param {Ref<Array>} opts.routePath  polyline [[lng,lat], …] (optional, for map position)
 * @param {Ref<number>} opts.now       reactive Date.now() (caller ticks this each second)
 */
export const SERVICE_START_MIN = 5 * 60;    // 05:00
export const SERVICE_END_MIN   = 22 * 60;   // 22:00
const APPROACH_WINDOW_MIN = 20;             // show "approaching" within N minutes
const BUS_SPEED_KMH = 20;                   // fallback when dataset has no per-stop times

export function isInServiceNow(d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= SERVICE_START_MIN && m <= SERVICE_END_MIN;
}

function haversineKm(a, b) {
  const R = 6371, toR = d => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function useBusProgress({ journey, routeStops, routePath, now }) {
  const pickupIdx = computed(() => routeStops.value.findIndex(s => s.id === journey.value?.fromStop?.id));
  const destIdx   = computed(() => routeStops.value.findIndex(s => s.id === journey.value?.toStop?.id));

  // Cumulative seconds to reach each stop — real spacing, scaled so the
  // pickup→destination ride equals the journey card's duration.
  const stopSecs = computed(() => {
    const s = routeStops.value;
    if (s.length < 2) return [0];
    const est = s.map(x => x.estimated_minutes_from_start);
    const monotonic = est.every((v, i) => v != null && (i === 0 || v >= est[i - 1]));
    let raw;
    if (monotonic) {
      raw = est.map(v => Number(v) * 60);
    } else {
      raw = [0];
      for (let i = 1; i < s.length; i++) {
        const d = haversineKm(
          { lat: +s[i - 1].latitude, lng: +s[i - 1].longitude },
          { lat: +s[i].latitude,     lng: +s[i].longitude });
        raw.push(raw[i - 1] + Math.max(25, (d / BUS_SPEED_KMH) * 3600));
      }
    }
    const pi = pickupIdx.value, di = destIdx.value, dur = journey.value?.summary?.durationMinutes;
    if (pi >= 0 && di > pi && dur && raw[di] > raw[pi]) {
      const f = (dur * 60) / (raw[di] - raw[pi]);
      raw = raw.map(v => v * f);
    }
    return raw;
  });
  const tAt = (idx) => {
    const t = stopSecs.value;
    return t.length ? (t[Math.max(0, Math.min(t.length - 1, idx))] || 0) : 0;
  };

  // When the bus leaves your pickup (today, or next service day if already passed).
  const departureMs = computed(() => {
    const dep = journey.value?.summary?.departureTime;
    if (!dep) return now.value;
    const [h, m] = dep.split(':').map(Number);
    let ms = new Date(now.value).setHours(h, m, 0, 0);
    if (ms < now.value - 6 * 3600 * 1000) ms += 24 * 3600 * 1000;
    return ms;
  });
  const originDepartMs = computed(() => departureMs.value - tAt(pickupIdx.value) * 1000);
  const busSimSec = computed(() => (now.value - originDepartMs.value) / 1000);

  const busIdxFloat = computed(() => {
    const t = stopSecs.value, x = busSimSec.value;
    if (t.length < 2) return 0;
    if (x <= t[0]) return 0;
    if (x >= t[t.length - 1]) return t.length - 1;
    let i = 0; while (i < t.length - 1 && t[i + 1] <= x) i++;
    const span = (t[i + 1] - t[i]) || 1;
    return i + (x - t[i]) / span;
  });
  const busAbsIdx = computed(() => Math.round(busIdxFloat.value));

  const inService = computed(() => isInServiceNow(new Date(now.value)));
  const minsToDeparture = computed(() => Math.max(0, Math.round((departureMs.value - now.value) / 60000)));
  const rideTotalSec = computed(() => Math.max(60, tAt(destIdx.value) - tAt(pickupIdx.value)));
  const minsToDest = computed(() => Math.max(0, Math.ceil((departureMs.value + rideTotalSec.value * 1000 - now.value) / 60000)));

  // waiting | approaching | riding | arrived
  const phase = computed(() => {
    const toDep = (departureMs.value - now.value) / 60000;
    if (toDep <= 0) {
      if (now.value >= departureMs.value + rideTotalSec.value * 1000) return 'arrived';
      return inService.value ? 'riding' : 'arrived';
    }
    if (inService.value && toDep <= APPROACH_WINDOW_MIN) return 'approaching';
    return 'waiting';
  });
  const hasDeparted = computed(() => phase.value === 'riding' || phase.value === 'arrived');
  const arrived     = computed(() => phase.value === 'arrived');
  const approaching = computed(() => phase.value === 'approaching');
  const stopsToPickup = computed(() => Math.max(0, pickupIdx.value - busAbsIdx.value));
  const stopsToDest   = computed(() => Math.max(0, destIdx.value   - busAbsIdx.value));

  // Status of a stop at absolute index i, for the live stop list.
  function stopStatus(i) {
    if (i === destIdx.value) return 'dest';
    if (i === pickupIdx.value && !hasDeparted.value) return 'pickup';
    if (phase.value !== 'waiting' && i === busAbsIdx.value) return 'current';
    if (phase.value !== 'waiting' && i < busAbsIdx.value) return 'passed';
    return 'upcoming';
  }

  // Bus position along the polyline (null while waiting → no bus running).
  const busLatLng = computed(() => {
    if (phase.value === 'waiting') return null;
    const path = routePath?.value;
    const n = routeStops.value.length;
    if (!path || path.length < 2 || n < 2) return null;
    const frac = Math.min(1, Math.max(0, busIdxFloat.value / (n - 1)));
    const fpos = frac * (path.length - 1);
    const i = Math.min(path.length - 2, Math.floor(fpos));
    const t = fpos - i;
    const a = path[i], b = path[i + 1];
    return [a[1] + (b[1] - a[1]) * t, a[0] + (b[0] - a[0]) * t];
  });

  return {
    pickupIdx, destIdx, busAbsIdx, busIdxFloat,
    phase, hasDeparted, arrived, approaching, inService,
    minsToDeparture, minsToDest, stopsToPickup, stopsToDest,
    departureMs, stopSecs, tAt, stopStatus, busLatLng,
  };
}
