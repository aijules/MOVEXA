require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { connectDB } = require('../../src/config/db');
const RoutePattern = require('../../src/models/RoutePattern');
const Stop = require('../../src/models/Stop');
const Line = require('../../src/models/Line');
const ImportRun = require('../../src/models/ImportRun');
const { readWorkbook, sheetToRows, getCellValue } = require('../../src/utils/excel');
const { parsePathString, haversineMeters } = require('../../src/utils/geo');
const { parseRouteId } = require('../../src/utils/normalize');

const DATA_DIR = path.join(__dirname, '../../../data/Routes');

const LINE_COLORS = [
  '#0EA5A3', '#2563EB', '#22C55E', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316',
];
let colorIdx = 20; // offset so colors don't clash with stops import
function pickColor() { return LINE_COLORS[colorIdx++ % LINE_COLORS.length]; }

async function upsertTerminalStop(coords, routeId, label) {
  const [lng, lat] = coords;
  const code = `TERMINAL_${routeId}_${label}`.replace(/[^A-Z0-9_]/g, '_').slice(0, 50);
  let stop = await Stop.findOne({ code });
  if (!stop) {
    stop = await Stop.create({
      code,
      name: `${routeId} ${label} Terminal`,
      normalizedName: `${routeId} ${label} TERMINAL`,
      location: { type: 'Point', coordinates: [lng, lat] },
    });
  }
  return stop;
}

function calcTotalKm(coords) {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineMeters(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]) / 1000;
  }
  return parseFloat(total.toFixed(2));
}

async function importFile(filePath, importRun, stats) {
  const wb = readWorkbook(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = sheetToRows(sheet);

  // Aggregate all segment rows per routeId
  // Each row has: col A = routeId, col 6 (G) = "lng,lat,lng,lat" segment
  const routeSegments = {}; // routeId -> [coord, coord, ...]

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRouteId = getCellValue(row, 0);
    if (!rawRouteId) continue;
    const routeId = parseRouteId(rawRouteId);
    if (!routeId || routeId.length > 20) continue;

    // skip header rows
    if (routeId === 'ROUTE' || routeId === 'FORWARD' || routeId === 'REVERSE') continue;

    const rawPath = getCellValue(row, 6);
    if (!rawPath) continue;

    const segCoords = parsePathString(rawPath);
    if (segCoords.length === 0) continue;

    if (!routeSegments[routeId]) routeSegments[routeId] = [];
    routeSegments[routeId].push(...segCoords);
  }

  // Deduplicate consecutive identical coordinates and apply
  for (const [routeId, allCoords] of Object.entries(routeSegments)) {
    if (allCoords.length < 2) {
      importRun.warnings.push(`Route ${routeId}: not enough valid coords (${allCoords.length})`);
      continue;
    }

    // Remove exact duplicates of consecutive points
    const coords = [allCoords[0]];
    for (let i = 1; i < allCoords.length; i++) {
      const prev = coords[coords.length - 1];
      if (allCoords[i][0] !== prev[0] || allCoords[i][1] !== prev[1]) {
        coords.push(allCoords[i]);
      }
    }

    const polyline = { type: 'LineString', coordinates: coords };

    // Try to match existing patterns: exact routeId, or base number → F/R variants
    const baseNum = routeId.replace(/[FR]$/, '');
    const candidateIds = [routeId, `${baseNum}F`, `${baseNum}R`];
    const existingPatterns = await RoutePattern.find({ routeId: { $in: candidateIds } });

    if (existingPatterns.length > 0) {
      for (const rp of existingPatterns) {
        rp.polyline = polyline;
        rp.usedFallbackPath = false;
        await rp.save();
        stats.pathsImported++;
      }
      console.log(`  ✓ Applied ${coords.length}-point path to ${existingPatterns.map(r => r.routeId).join(', ')}`);
    } else {
      // Create a new Line + RoutePattern for this path-only route
      let line = await Line.findOne({ shortName: routeId });
      if (!line) {
        line = await Line.create({
          shortName: routeId,
          longName: `Route ${routeId}`,
          color: pickColor(),
          textColor: '#FFFFFF',
        });
        stats.routesImported++;
      }

      const startStop = await upsertTerminalStop(coords[0], routeId, 'START');
      const endStop = await upsertTerminalStop(coords[coords.length - 1], routeId, 'END');
      stats.stopsImported += 2;

      const totalKm = calcTotalKm(coords);

      await RoutePattern.create({
        routeId,
        lineId: line._id,
        headsign: `Route ${routeId} Terminal`,
        stops: [
          { stopId: startStop._id, sequence: 1, distanceFromStartKm: 0 },
          { stopId: endStop._id, sequence: 2, distanceFromStartKm: totalKm },
        ],
        polyline,
        usedFallbackPath: false,
        distanceKm: totalKm,
        isActive: true,
      });

      stats.pathsImported++;
      console.log(`  ✓ Created new pattern ${routeId} with ${coords.length}-point path (${totalKm} km)`);
    }
  }
}

async function buildFallbackPaths(importRun, stats) {
  const patterns = await RoutePattern.find({
    $or: [
      { 'polyline.coordinates': { $size: 0 } },
      { polyline: { $exists: false } },
    ],
  });
  if (patterns.length === 0) { console.log('No routes need fallback paths.'); return; }
  console.log(`Building fallback paths for ${patterns.length} routes without paths`);

  for (const rp of patterns) {
    const sortedStops = [...rp.stops].sort((a, b) => a.sequence - b.sequence);
    const fallbackCoords = [];
    for (const s of sortedStops) {
      const stop = await Stop.findById(s.stopId);
      if (stop) fallbackCoords.push(stop.location.coordinates);
    }
    if (fallbackCoords.length >= 2) {
      rp.polyline = { type: 'LineString', coordinates: fallbackCoords };
      rp.usedFallbackPath = true;
      await rp.save();
      stats.pathsImported++;
      importRun.warnings.push(`Route ${rp.routeId}: used fallback path`);
    }
  }
}

async function run() {
  await connectDB();

  // Drop previously created path-only patterns so we can re-import cleanly
  const pathOnlyPatterns = await RoutePattern.find({ 'stops.0.code': /^TERMINAL_/ }).lean();
  // Actually, find patterns whose stops are terminal stubs (2 stops, code starts with TERMINAL_)
  const stubPatterns = await RoutePattern.aggregate([
    { $lookup: { from: 'stops', localField: 'stops.stopId', foreignField: '_id', as: 'stopDocs' } },
    { $match: { $expr: { $eq: [{ $size: '$stops' }, 2] }, 'stopDocs.code': /^TERMINAL_/ } },
  ]);

  // Simpler: delete route patterns whose routeId is a plain number (no F/R and not in stops files)
  // We'll just reset polylines on all patterns so we get clean paths
  await RoutePattern.updateMany({}, { $set: { 'polyline.coordinates': [], usedFallbackPath: false } });
  console.log('Reset all polylines for clean re-import...');

  const importRun = await ImportRun.create({ type: 'route-paths' });
  const stats = { routesImported: 0, stopsImported: 0, pathsImported: 0, vehiclesImported: 0 };

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('-with-path.xlsx'));
  console.log(`\nFound ${files.length} route-path files`);

  for (const file of files) {
    console.log(`\nImporting path: ${file}`);
    try {
      await importFile(path.join(DATA_DIR, file), importRun, stats);
    } catch (err) {
      importRun.importErrors.push(`${file}: ${err.message}`);
      console.error(`  ERROR in ${file}:`, err.message);
    }
  }

  await buildFallbackPaths(importRun, stats);

  importRun.stats = stats;
  importRun.status = 'completed';
  importRun.completedAt = new Date();
  await importRun.save();

  console.log('\n=== Path Import Summary ===');
  console.log(`New routes created:  ${stats.routesImported}`);
  console.log(`Paths imported:      ${stats.pathsImported}`);
  console.log(`Warnings:            ${importRun.warnings.length}`);
  console.log(`Errors:              ${importRun.importErrors.length}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
