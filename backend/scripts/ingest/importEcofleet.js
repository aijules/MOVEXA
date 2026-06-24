require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/db');
const Vehicle = require('../../src/models/Vehicle');
const OccupancyStat = require('../../src/models/OccupancyStat');
const ImportRun = require('../../src/models/ImportRun');
const { readWorkbook, sheetToRows, getCellValue } = require('../../src/utils/excel');
const { parseNumber } = require('../../src/utils/normalize');

const DATA_DIR = path.join(__dirname, '../../../data');

function getOccupancyLevel(rate) {
  if (rate < 0.35) return 'LOW';
  if (rate < 0.65) return 'MEDIUM';
  if (rate < 0.9) return 'HIGH';
  return 'CROWDED';
}

async function importFile(filePath, importRun, stats) {
  const wb = readWorkbook(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(sheet);

  // skip header row
  const dataRows = rows.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const institution = getCellValue(row, 0);
    const rawDate = getCellValue(row, 1);
    const plate = getCellValue(row, 2);
    const rawStdBoarding = getCellValue(row, 3);
    const rawPassengers = getCellValue(row, 4);

    if (!plate) continue;

    const standardBoardingPiece = parseNumber(rawStdBoarding) || 60;
    const passengers = parseNumber(rawPassengers) || 0;
    const occupancyRate = passengers / Math.max(standardBoardingPiece, 1);
    const occupancyLevel = getOccupancyLevel(occupancyRate);

    // Upsert vehicle
    await Vehicle.findOneAndUpdate(
      { plate },
      { plate, institution, isActive: true, occupancy: occupancyLevel },
      { upsert: true, new: true }
    );

    await OccupancyStat.create({
      plate,
      institution,
      date: rawDate ? new Date(rawDate) : null,
      standardBoardingPiece,
      passengers,
      occupancyRate: parseFloat(occupancyRate.toFixed(3)),
      occupancyLevel,
    });

    stats.vehiclesImported++;
  }
}

async function run() {
  await connectDB();
  const importRun = await ImportRun.create({ type: 'ecofleet' });
  const stats = { routesImported: 0, stopsImported: 0, pathsImported: 0, vehiclesImported: 0 };

  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('ECOFLEET_') && f.endsWith('.xlsx'));
  console.log(`Found ${files.length} ECOFLEET files`);

  for (const file of files) {
    console.log(`  Importing fleet: ${file}`);
    try {
      await importFile(path.join(DATA_DIR, file), importRun, stats);
    } catch (err) {
      importRun.importErrors.push(`${file}: ${err.message}`);
      console.error(`  ERROR in ${file}:`, err.message);
    }
  }

  importRun.stats = stats;
  importRun.status = 'completed';
  importRun.completedAt = new Date();
  await importRun.save();

  console.log('\n=== Fleet Import Summary ===');
  console.log(`Vehicles imported: ${stats.vehiclesImported}`);
  console.log(`Warnings:          ${importRun.warnings.length}`);
  console.log(`Errors:            ${importRun.importErrors.length}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
