const RoutePattern = require('../models/RoutePattern');
const Trip = require('../models/Trip');
const StopTime = require('../models/StopTime');
const Vehicle = require('../models/Vehicle');
const { interpolatePolyline, calcBearing } = require('../utils/geo');
const { HHMMtoMinutes, nowHHMM, getPeakDelayMinutes } = require('../utils/time');

let io = null;
let simulationInterval = null;

function setIO(socketIO) {
  io = socketIO;
}

async function getActiveTrips() {
  const now = nowHHMM();
  const nowMins = HHMMtoMinutes(now);

  return Trip.find({
    isActive: true,
    scheduledStartTime: { $lte: now },
  })
    .populate('routePatternId')
    .limit(50);
}

async function simulateTick() {
  const now = nowHHMM();
  const nowMins = HHMMtoMinutes(now);

  const trips = await getActiveTrips();
  const vehicles = await Vehicle.find({ isActive: true }).limit(50);

  for (let i = 0; i < Math.min(trips.length, vehicles.length); i++) {
    const trip = trips[i];
    const vehicle = vehicles[i];
    const rp = trip.routePatternId;

    if (!rp || !rp.polyline || rp.polyline.coordinates.length < 2) continue;

    const startMins = HHMMtoMinutes(trip.scheduledStartTime);
    const routeDistKm = rp.distanceKm || 5;
    const totalTripMins = (routeDistKm / 25) * 60;
    const elapsed = nowMins - startMins;
    const progress = Math.min(Math.max(elapsed / totalTripMins, 0), 1);

    const coords = rp.polyline.coordinates;
    const position = interpolatePolyline(coords, progress);
    if (!position) continue;

    const nextIdx = Math.min(Math.floor(progress * (coords.length - 1)) + 1, coords.length - 1);
    const bearing = calcBearing(position, coords[nextIdx]);
    const delayMins = getPeakDelayMinutes(now);
    const delaySeconds = delayMins * 60;

    const occupancyLevels = ['LOW', 'MEDIUM', 'HIGH', 'CROWDED'];
    const occupancy = occupancyLevels[Math.floor(Math.random() * 3)];

    await Vehicle.findByIdAndUpdate(vehicle._id, {
      currentLocation: { type: 'Point', coordinates: position },
      currentTripId: trip._id,
      currentRoutePatternId: rp._id,
      bearing,
      speedKph: 20 + Math.random() * 15,
      delaySeconds,
      occupancy,
      lastSeenAt: new Date(),
    });

    if (io) {
      const payload = {
        vehicleId: vehicle._id,
        plate: vehicle.plate,
        tripId: trip._id,
        lineId: rp.lineId,
        routeId: rp.routeId,
        lat: position[1],
        lng: position[0],
        bearing,
        delaySeconds,
        occupancy,
        recordedAt: new Date().toISOString(),
      };
      io.emit('vehicle:location', payload);
    }
  }
}

function startSimulation() {
  if (simulationInterval) return;
  simulationInterval = setInterval(simulateTick, 5000);
  console.log('Vehicle simulation started');
}

function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
}

module.exports = { setIO, startSimulation, stopSimulation, simulateTick };
