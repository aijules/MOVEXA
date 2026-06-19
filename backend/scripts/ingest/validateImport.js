require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/db');
const Stop = require('../../src/models/Stop');
const Line = require('../../src/models/Line');
const RoutePattern = require('../../src/models/RoutePattern');
const Trip = require('../../src/models/Trip');
const StopTime = require('../../src/models/StopTime');
const Vehicle = require('../../src/models/Vehicle');

async function run() {
  await connectDB();

  const stops = await Stop.countDocuments();
  const lines = await Line.countDocuments();
  const patterns = await RoutePattern.countDocuments();
  const withPath = await RoutePattern.countDocuments({ 'polyline.coordinates.0': { $exists: true }, usedFallbackPath: false });
  const fallbackPath = await RoutePattern.countDocuments({ usedFallbackPath: true });
  const noPaths = await RoutePattern.countDocuments({ 'polyline.coordinates': { $size: 0 } });
  const vehicles = await Vehicle.countDocuments();
  const trips = await Trip.countDocuments();
  const stopTimes = await StopTime.countDocuments();

  console.log('\n=== Data Health Report ===');
  console.log(`Stops:                     ${stops}`);
  console.log(`Lines:                     ${lines}`);
  console.log(`Route patterns:            ${patterns}`);
  console.log(`  - With real path:        ${withPath}`);
  console.log(`  - With fallback path:    ${fallbackPath}`);
  console.log(`  - Without path:          ${noPaths}`);
  console.log(`Vehicles:                  ${vehicles}`);
  console.log(`Trips generated:           ${trips}`);
  console.log(`Stop times generated:      ${stopTimes}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
