const Stop = require('../models/Stop');
const RoutePattern = require('../models/RoutePattern');
const Trip = require('../models/Trip');
const StopTime = require('../models/StopTime');
const { haversineMeters } = require('../utils/geo');
const { HHMMtoMinutes, minutesToHHMM } = require('../utils/time');

const WALKING_SPEED_MPM = 80;
const TRANSFER_PENALTY = 8;
const MAX_NEARBY_STOPS = 5;
const NEARBY_RADIUS_M = 800;

async function findNearbyStops(lat, lng, radiusM = NEARBY_RADIUS_M) {
  return Stop.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusM,
      },
    },
  }).limit(MAX_NEARBY_STOPS);
}

async function getStopById(stopId) {
  return Stop.findById(stopId);
}

async function findDirectTrips(originStopId, destStopId, afterMins) {
  const patterns = await RoutePattern.find({
    'stops.stopId': { $all: [originStopId, destStopId] },
    isActive: true,
  });

  const results = [];
  for (const rp of patterns) {
    const originEntry = rp.stops.find(s => s.stopId.toString() === originStopId.toString());
    const destEntry = rp.stops.find(s => s.stopId.toString() === destStopId.toString());
    if (!originEntry || !destEntry) continue;
    if (originEntry.sequence >= destEntry.sequence) continue;

    const trips = await Trip.find({ routePatternId: rp._id, isActive: true }).sort({ scheduledStartTime: 1 });

    for (const trip of trips) {
      const originST = await StopTime.findOne({ tripId: trip._id, stopId: originStopId });
      const destST = await StopTime.findOne({ tripId: trip._id, stopId: destStopId });
      if (!originST || !destST) continue;

      const depMins = HHMMtoMinutes(originST.departureTime);
      if (depMins < afterMins) continue;

      const arrMins = HHMMtoMinutes(destST.arrivalTime);
      const rideMinutes = arrMins - depMins;

      results.push({
        type: 'direct',
        routePatternId: rp._id,
        lineId: rp.lineId,
        routeId: rp.routeId,
        tripId: trip._id,
        tripCode: trip.tripCode,
        headsign: trip.headsign,
        polyline: rp.polyline,
        originStop: { id: originStopId, time: originST.departureTime },
        destStop: { id: destStopId, time: destST.arrivalTime },
        departureTime: originST.departureTime,
        arrivalTime: destST.arrivalTime,
        durationMinutes: rideMinutes,
        transfers: 0,
        walkingMeters: 0,
      });

      if (results.filter(r => r.routeId === rp.routeId).length >= 3) break;
    }
  }

  return results;
}

async function findTransferTrips(originStopId, destStopId, afterMins) {
  const originPatterns = await RoutePattern.find({ 'stops.stopId': originStopId, isActive: true });
  const destPatterns = await RoutePattern.find({ 'stops.stopId': destStopId, isActive: true });

  const originStopIds = new Set();
  for (const rp of originPatterns) rp.stops.forEach(s => originStopIds.add(s.stopId.toString()));

  const results = [];

  for (const destRP of destPatterns) {
    const transferStops = destRP.stops.filter(s => originStopIds.has(s.stopId.toString()));
    for (const ts of transferStops) {
      const transferStopId = ts.stopId;
      const leg1 = await findDirectTrips(originStopId, transferStopId, afterMins);
      if (leg1.length === 0) continue;

      const bestLeg1 = leg1[0];
      const transferMins = HHMMtoMinutes(bestLeg1.arrivalTime) + 5;
      const leg2 = await findDirectTrips(transferStopId, destStopId, transferMins);
      if (leg2.length === 0) continue;

      const bestLeg2 = leg2[0];
      const totalDuration = HHMMtoMinutes(bestLeg2.arrivalTime) - HHMMtoMinutes(bestLeg1.departureTime);

      results.push({
        type: 'transfer',
        legs: [bestLeg1, bestLeg2],
        transferStopId,
        departureTime: bestLeg1.departureTime,
        arrivalTime: bestLeg2.arrivalTime,
        durationMinutes: totalDuration,
        transfers: 1,
        walkingMeters: 0,
      });

      if (results.length >= 2) break;
    }
    if (results.length >= 2) break;
  }

  return results;
}

function scoreJourney(j, preference = 'fastest') {
  const transferWeight = preference === 'fewest_transfers' ? 15 : TRANSFER_PENALTY;
  const walkWeight = preference === 'least_walking' ? 1 / 40 : 1 / 100;
  return j.durationMinutes + j.transfers * transferWeight + (j.walkingMeters || 0) * walkWeight;
}

async function searchJourneys({ originLat, originLng, originStopId, destLat, destLng, destStopId, departureTime = '08:00', preference = 'fastest' }) {
  const afterMins = HHMMtoMinutes(departureTime);

  let originStops = [];
  let destStops = [];
  let walkToOriginM = 0;
  let walkFromDestM = 0;

  if (originStopId) {
    const s = await getStopById(originStopId);
    if (s) originStops = [s];
  } else if (originLat != null && originLng != null) {
    originStops = await findNearbyStops(originLat, originLng);
    if (originStops.length > 0) {
      walkToOriginM = haversineMeters(originLat, originLng, originStops[0].location.coordinates[1], originStops[0].location.coordinates[0]);
    }
  }

  if (destStopId) {
    const s = await getStopById(destStopId);
    if (s) destStops = [s];
  } else if (destLat != null && destLng != null) {
    destStops = await findNearbyStops(destLat, destLng);
    if (destStops.length > 0) {
      walkFromDestM = haversineMeters(destLat, destLng, destStops[0].location.coordinates[1], destStops[0].location.coordinates[0]);
    }
  }

  if (originStops.length === 0 || destStops.length === 0) return [];

  const journeys = [];

  for (const origin of originStops.slice(0, 3)) {
    for (const dest of destStops.slice(0, 3)) {
      const direct = await findDirectTrips(origin._id, dest._id, afterMins);
      journeys.push(...direct.map(j => ({ ...j, walkingMeters: walkToOriginM + walkFromDestM })));

      if (direct.length === 0) {
        const transfers = await findTransferTrips(origin._id, dest._id, afterMins);
        journeys.push(...transfers.map(j => ({ ...j, walkingMeters: walkToOriginM + walkFromDestM })));
      }
    }
  }

  return journeys
    .sort((a, b) => scoreJourney(a, preference) - scoreJourney(b, preference))
    .slice(0, 5);
}

module.exports = { searchJourneys, findNearbyStops };
