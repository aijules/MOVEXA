require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/db');
const RoutePattern = require('../../src/models/RoutePattern');
const Stop = require('../../src/models/Stop');
const Trip = require('../../src/models/Trip');
const StopTime = require('../../src/models/StopTime');
const ImportRun = require('../../src/models/ImportRun');
const { generateDepartureTimes, HHMMtoMinutes, minutesToHHMM } = require('../../src/utils/time');

const AVG_SPEED_KMH = 25;
const DWELL_SECONDS = 45;
const HEADWAY_MINUTES = 20;

async function run() {
  await connectDB();
  const importRun = await ImportRun.create({ type: 'schedules' });
  const stats = { tripsGenerated: 0, stopTimesGenerated: 0 };

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  // clear existing for today
  await Trip.deleteMany({ serviceDate: dateStr });
  await StopTime.deleteMany({});

  const patterns = await RoutePattern.find({ isActive: true });
  console.log(`Generating schedules for ${patterns.length} route patterns`);

  const departureTimes = generateDepartureTimes('05:00', '22:00', HEADWAY_MINUTES);

  for (const rp of patterns) {
    if (!rp.stops || rp.stops.length < 2) continue;

    const sortedStops = [...rp.stops].sort((a, b) => a.sequence - b.sequence);

    for (const depTime of departureTimes) {
      const tripCode = `${rp.routeId}_${dateStr}_${depTime.replace(':', '')}`;
      const trip = await Trip.create({
        tripCode,
        lineId: rp.lineId,
        routePatternId: rp._id,
        headsign: rp.headsign || rp.routeId,
        direction: 0,
        scheduledStartTime: depTime,
        serviceDate: dateStr,
      });

      const stopTimes = [];
      const depMins = HHMMtoMinutes(depTime);

      for (let i = 0; i < sortedStops.length; i++) {
        const s = sortedStops[i];
        const travelMins = (s.distanceFromStartKm / AVG_SPEED_KMH) * 60;
        const dwellMins = (i * DWELL_SECONDS) / 60;
        const arrMins = depMins + travelMins + dwellMins;
        const depMinsStop = arrMins + DWELL_SECONDS / 60;

        stopTimes.push({
          tripId: trip._id,
          stopId: s.stopId,
          stopSequence: s.sequence,
          arrivalTime: minutesToHHMM(Math.round(arrMins)),
          departureTime: minutesToHHMM(Math.round(depMinsStop)),
          distanceFromStartKm: s.distanceFromStartKm,
        });
      }

      await StopTime.insertMany(stopTimes);
      stats.tripsGenerated++;
      stats.stopTimesGenerated += stopTimes.length;
    }
  }

  importRun.stats = stats;
  importRun.status = 'completed';
  importRun.completedAt = new Date();
  await importRun.save();

  console.log('\n=== Schedule Generation Summary ===');
  console.log(`Trips generated:      ${stats.tripsGenerated}`);
  console.log(`Stop times generated: ${stats.stopTimesGenerated}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
