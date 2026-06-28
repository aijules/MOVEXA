/**
 * ETA Prediction Engine
 * Formula: ETA = distance_remaining / speed + traffic_delay + schedule_delay
 */
const { HHMMtoMinutes } = require('../utils/time');
const { haversineMeters, interpolatePolyline } = require('../utils/geo');

// Peak hour multipliers per REQUIREMENTS.md
function getPeakFactor(nowMins) {
  if (nowMins >= 6 * 60 + 30 && nowMins <= 9 * 60)  return 1.35;
  if (nowMins >= 17 * 60 && nowMins <= 20 * 60)       return 1.45;
  return 1.0;
}

function delayLabel(delayMins) {
  if (delayMins <= 3)  return 'on_time';
  if (delayMins <= 8)  return 'minor_delay';
  if (delayMins <= 15) return 'major_delay';
  return 'critical_delay';
}

function delayMessage(delayMins) {
  if (delayMins <= 3)  return 'On time';
  if (delayMins <= 8)  return 'Minor delay';
  if (delayMins <= 15) return 'Schedule adjusted due to delay';
  return 'Major disruption, backup recommended';
}

/**
 * Calculate ETA from a bus position to a target stop.
 * @param {[number,number]} busPos       [lng, lat]
 * @param {{latitude,longitude}} stop    target stop
 * @param {Array} pathCoords             [[lng,lat],...]
 * @param {number} speedKph
 * @param {number} scheduleDelayMins
 * @param {boolean} hasIncident
 * @returns {{ etaMinutes, delayMinutes, delayStatus, delayMessage }}
 */
function calculateETA(busPos, stop, pathCoords, speedKph = 15, scheduleDelayMins = 0, hasIncident = false) {
  const now     = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const factor  = getPeakFactor(nowMins);

  // Distance from bus to stop (straight line via haversine)
  const distM   = haversineMeters(busPos[1], busPos[0], Number(stop.latitude), Number(stop.longitude));
  const distKm  = distM / 1000;

  // Effective speed adjusted for peak hour
  const effSpeed = Math.max(5, speedKph / factor);

  // Travel time in minutes
  const travelMins = (distKm / effSpeed) * 60;

  // Incident adds 5 minutes
  const incidentDelay = hasIncident ? 5 : 0;

  const totalDelay   = scheduleDelayMins + incidentDelay;
  const etaMinutes   = Math.round(travelMins + totalDelay);
  const delayMins    = Math.round(totalDelay + Math.max(0, travelMins - (distKm / 25) * 60));

  return {
    etaMinutes:   Math.max(1, etaMinutes),
    delayMinutes: Math.max(0, delayMins),
    delayStatus:  delayLabel(delayMins),
    delayMessage: delayMessage(delayMins),
    confidence:   0.85 - (delayMins * 0.01),
  };
}

/**
 * Calculate progress of a trip at current time.
 */
function calcTripProgress(startTimeMins, durationMins, nowMins) {
  if (nowMins < startTimeMins) return 0;
  const elapsed = nowMins - startTimeMins;
  return Math.min(1, elapsed / Math.max(1, durationMins));
}

module.exports = { calculateETA, calcTripProgress, getPeakFactor, delayLabel, delayMessage };
