require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/db');
const Stop = require('../../src/models/Stop');
const Line = require('../../src/models/Line');
const RoutePattern = require('../../src/models/RoutePattern');
const ImportRun = require('../../src/models/ImportRun');
const { readWorkbook, sheetToRows, getCellValue } = require('../../src/utils/excel');
const { normalizeStopName, makeStopCode, parseNumber, parseRouteId, parseSequence } = require('../../src/utils/normalize');

const DATA_DIR = path.join(__dirname, '../../../data/Routes');

const LINE_COLORS = [
  '#0EA5A3', '#2563EB', '#22C55E', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
];

function pickColor(index) {
  return LINE_COLORS[index % LINE_COLORS.length];
}

async function importFile(filePath, importRun, stats, colorIndex) {
  const wb = readWorkbook(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(sheet);

  // data starts at row index 3 (0-based) => row 4 in Excel
  const dataRows = rows.slice(3);

  let routeId = null;
  let routePattern = null;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rawRouteId = getCellValue(row, 0);
    const rawSeq = getCellValue(row, 1);
    const rawName = getCellValue(row, 2);
    const rawDist = getCellValue(row, 3);
    const rawLat = getCellValue(row, 4);
    const rawLng = getCellValue(row, 5);

    if (!rawRouteId && !rawName) continue;

    const rid = parseRouteId(rawRouteId) || routeId;
    if (!rid) { importRun.warnings.push(`File ${path.basename(filePath)} row ${i + 4}: missing route ID`); continue; }
    routeId = rid;

    const stopName = rawName ? normalizeStopName(rawName) : null;
    if (!stopName) { importRun.warnings.push(`Route ${routeId} row ${i + 4}: missing stop name`); continue; }

    const lat = parseNumber(rawLat);
    const lng = parseNumber(rawLng);
    const seq = parseSequence(rawSeq) || (i + 1);
    const dist = parseNumber(rawDist) || 0;

    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      importRun.warnings.push(`Route ${routeId} stop "${stopName}": invalid coords (${rawLat}, ${rawLng})`);
      continue;
    }

    // Upsert line
    const lineShortName = routeId;
    let line = await Line.findOne({ shortName: lineShortName });
    if (!line) {
      line = await Line.create({
        shortName: lineShortName,
        longName: `Route ${lineShortName}`,
        color: pickColor(colorIndex),
        textColor: '#FFFFFF',
      });
      stats.routesImported++;
      colorIndex++;
    }

    // Upsert stop
    const code = makeStopCode(stopName);
    let stop = await Stop.findOne({ code });
    if (!stop) {
      stop = await Stop.create({
        code,
        name: stopName,
        normalizedName: stopName,
        location: { type: 'Point', coordinates: [lng, lat] },
      });
      stats.stopsImported++;
    }

    // Upsert route pattern
    if (!routePattern || routePattern.routeId !== routeId) {
      routePattern = await RoutePattern.findOne({ routeId });
      if (!routePattern) {
        routePattern = new RoutePattern({ routeId, lineId: line._id, stops: [] });
      }
      routePattern.lineId = line._id;
    }

    const exists = routePattern.stops.find(s => s.stopId.toString() === stop._id.toString());
    if (!exists) {
      routePattern.stops.push({ stopId: stop._id, sequence: seq, distanceFromStartKm: dist });
    }

    const maxDist = routePattern.stops.reduce((max, s) => Math.max(max, s.distanceFromStartKm), 0);
    routePattern.distanceKm = maxDist;
    routePattern.headsign = routePattern.stops.length > 0 ? stopName : routePattern.headsign;

    await routePattern.save();
  }
}

async function run() {
  await connectDB();
  const importRun = await ImportRun.create({ type: 'routes-stops' });

  const stats = { routesImported: 0, stopsImported: 0, pathsImported: 0, vehiclesImported: 0 };
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-with-stops.xlsx'));

  console.log(`Found ${files.length} route-stops files`);
  let colorIndex = 0;

  for (const file of files) {
    console.log(`  Importing: ${file}`);
    try {
      await importFile(path.join(DATA_DIR, file), importRun, stats, colorIndex++);
    } catch (err) {
      importRun.importErrors.push(`${file}: ${err.message}`);
      console.error(`  ERROR in ${file}:`, err.message);
    }
  }

  importRun.stats = stats;
  importRun.status = 'completed';
  importRun.completedAt = new Date();
  await importRun.save();

  console.log('\n=== Import Summary ===');
  console.log(`Routes imported:  ${stats.routesImported}`);
  console.log(`Stops imported:   ${stats.stopsImported}`);
  console.log(`Warnings:         ${importRun.warnings.length}`);
  console.log(`Errors:           ${importRun.importErrors.length}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
