/**
 * MOVEXA Shared Transport Calculation Source
 * Single source of truth for: duration, fare, pass prices.
 * Used by journeys.routes, tickets.routes, vehicles.routes.
 */
const { haversineMeters } = require('../utils/geo');
const { getPeakFactor }   = require('./eta.service');

// ── Transit constants (REQUIREMENTS.md formula) ──────────────────────────────
const FARE_PER_KM       = 59.48;  // RWF per km
const BASE_SPEED_KPH    = 60;     // legacy export (no longer used for duration)
// Realistic Kigali city-bus model (overrides the old 60 km/h assumption):
const AVG_MOVING_SPEED_KPH = 24;  // real moving speed between stops, with light traffic
const ROAD_FACTOR       = 1.35;   // road ≈ 35% longer than straight line (haversine fallback)
const DWELL_PER_STOP    = 0.5;    // minutes dwell per intermediate stop (~30 seconds)
const WEEKLY_RIDES      = 14;     // 2 trips/day × 7 days
const MONTHLY_RIDES     = 60;     // 2 trips/day × 30 days
const WEEKLY_DISCOUNT   = 0.82;   // 18% off
const MONTHLY_DISCOUNT  = 0.72;   // 28% off

/**
 * Compute road distance (km) for a stop-to-stop segment.
 * Prefers route total_distance_km × fraction when available (most accurate).
 * Falls back to haversine × ROAD_FACTOR.
 */
function computeRoadKm({ fromLat, fromLng, toLat, toLng,
                          fromOrder = 0, toOrder = 1,
                          totalRouteStops = 0, routeTotalDistKm = 0 }) {
  if (routeTotalDistKm > 0 && totalRouteStops > 1) {
    const fraction = Math.max(0.05, Math.min(1, (toOrder - fromOrder) / (totalRouteStops - 1)));
    return parseFloat((routeTotalDistKm * fraction).toFixed(2));
  }
  const straightKm = haversineMeters(
    Number(fromLat), Number(fromLng),
    Number(toLat),   Number(toLng)
  ) / 1000;
  return parseFloat((straightKm * ROAD_FACTOR).toFixed(2));
}

/**
 * Compute realistic travel duration in minutes:
 *   moveTime  = distanceKm / AVG_MOVING_SPEED_KPH × 60   (real bus speed w/ traffic)
 *   dwellTime = intermediateStops × DWELL_PER_STOP        (boarding/alighting at each stop)
 *   traffic   = proportional peak-hour slowdown
 * e.g. ~23 km / 26 stops ≈ 70 min off-peak — matching real Kigali experience,
 * not the old 60 km/h (which gave an unrealistic ~42 min).
 */
function computeDuration(roadKm, intermediateStops = 0, nowMins = null) {
  const nm         = nowMins ?? (new Date().getHours() * 60 + new Date().getMinutes());
  const peakFactor = getPeakFactor(nm);
  const moveTime   = (roadKm / AVG_MOVING_SPEED_KPH) * 60;
  const dwellTime  = intermediateStops * DWELL_PER_STOP;
  const base       = moveTime + dwellTime;
  const trafficAdd = base * (peakFactor - 1.0) * 0.6;   // moderate, peak-hour only
  return Math.max(5, Math.round(base + trafficAdd));
}

/**
 * Compute single-trip fare: roadKm × 59.48 RWF, rounded to nearest 50.
 */
function computeFare(roadKm) {
  return Math.max(200, Math.round((roadKm * FARE_PER_KM) / 50) * 50);
}

/**
 * Compute 7-day and 1-month unlimited pass prices from single-trip fare.
 * Formula: singleFare × rides × discount, rounded to nearest 500 RWF.
 */
function computePassPrices(singleFare) {
  const sevenDay = Math.max(3000,  Math.round((singleFare * WEEKLY_RIDES  * WEEKLY_DISCOUNT)  / 500) * 500);
  const oneMonth = Math.max(10000, Math.round((singleFare * MONTHLY_RIDES * MONTHLY_DISCOUNT) / 500) * 500);
  return { sevenDay, oneMonth };
}

module.exports = { computeRoadKm, computeDuration, computeFare, computePassPrices, FARE_PER_KM, BASE_SPEED_KPH };
