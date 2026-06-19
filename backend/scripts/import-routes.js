/**
 * Import routes + stops + route_stops from *-with-stops.xlsx files into Supabase.
 * Also handles *-with-path.xlsx files that lack stops by creating START/END stub stops.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs   = require('fs');
const { supabase } = require('../src/config/supabase');
const { readWorkbook, sheetToRows, getCellValue } = require('../src/utils/excel');
const { normalizeStopName, makeStopCode, parseNumber, parseRouteId, parseSequence } = require('../src/utils/normalize');

const DATA_DIR = path.join(__dirname, '../../data/Routes');

const LINE_COLORS = [
  '#0EA5A3','#2563EB','#22C55E','#F59E0B','#EF4444',
  '#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316',
  '#0284C7','#7C3AED','#DC2626','#16A34A','#D97706',
];
let colorIdx = 0;
const stopCache   = new Map(); // code -> id
const routeCache  = new Map(); // route_code -> id

async function upsertRoute(routeCode, firstStop, lastStop, colorIdx) {
  if (routeCache.has(routeCode)) return routeCache.get(routeCode);
  const color = LINE_COLORS[colorIdx % LINE_COLORS.length];
  const { data, error } = await supabase
    .from('routes')
    .upsert({
      route_code:       routeCode,
      route_name:       `Route ${routeCode}`,
      origin_name:      firstStop || '',
      destination_name: lastStop  || '',
      color,
      text_color: '#FFFFFF',
      status: 'active',
    }, { onConflict: 'route_code' })
    .select('id')
    .single();
  if (error) throw new Error(`upsertRoute ${routeCode}: ${error.message}`);
  routeCache.set(routeCode, data.id);
  return data.id;
}

async function upsertStop(stopName, lat, lng) {
  const code = makeStopCode(stopName);
  if (stopCache.has(code)) return stopCache.get(code);

  const { data, error } = await supabase
    .from('stops')
    .upsert({
      stop_code:  code,
      stop_name:  normalizeStopName(stopName),
      latitude:   lat,
      longitude:  lng,
      is_active:  true,
    }, { onConflict: 'stop_code' })
    .select('id')
    .single();
  if (error) throw new Error(`upsertStop ${stopName}: ${error.message}`);
  stopCache.set(code, data.id);
  return data.id;
}

async function upsertRouteStop(routeId, stopId, order, distKm, estMins) {
  const { error } = await supabase
    .from('route_stops')
    .upsert({
      route_id:                    routeId,
      stop_id:                     stopId,
      stop_order:                  order,
      distance_from_start_km:      distKm,
      estimated_minutes_from_start: estMins,
    }, { onConflict: 'route_id,stop_order' });
  if (error) throw new Error(`upsertRouteStop: ${error.message}`);
}

async function importStopsFile(filePath, stats) {
  const wb   = readWorkbook(filePath);
  const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]).slice(3);

  const routeStopMap = {}; // routeCode -> [{stopName,lat,lng,seq,dist}]

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawRoute = getCellValue(row, 0);
    const rawSeq   = getCellValue(row, 1);
    const rawName  = getCellValue(row, 2);
    const rawDist  = getCellValue(row, 3);
    const rawLat   = getCellValue(row, 4);
    const rawLng   = getCellValue(row, 5);

    const routeCode = parseRouteId(rawRoute);
    const stopName  = rawName ? normalizeStopName(rawName) : null;
    if (!routeCode || !stopName) continue;

    const lat  = parseNumber(rawLat);
    const lng  = parseNumber(rawLng);
    if (lat === null || lng === null || lat < -3 || lat > -1 || lng < 28 || lng > 31.5) continue;

    const seq  = parseSequence(rawSeq) || (i + 1);
    const dist = parseNumber(rawDist) || 0;

    if (!routeStopMap[routeCode]) routeStopMap[routeCode] = [];
    routeStopMap[routeCode].push({ stopName, lat, lng, seq, dist });
  }

  for (const [routeCode, entries] of Object.entries(routeStopMap)) {
    entries.sort((a, b) => a.seq - b.seq);
    const firstStop = entries[0]?.stopName;
    const lastStop  = entries[entries.length - 1]?.stopName;
    const routeId   = await upsertRoute(routeCode, firstStop, lastStop, colorIdx++);

    let newRoute = false;
    if (!routeCache.has(routeCode)) newRoute = true;
    if (newRoute) stats.routes++;

    const avgSpeedKph = 25;
    for (const entry of entries) {
      const stopId = await upsertStop(entry.stopName, entry.lat, entry.lng);
      const estMins = Math.round((entry.dist / avgSpeedKph) * 60);
      await upsertRouteStop(routeId, stopId, entry.seq, entry.dist, estMins);
      stats.stops++;
      stats.routeStops++;
    }
    console.log(`  ✓ ${routeCode}: ${entries.length} stops`);
  }
}

async function run() {
  console.log('=== Importing routes + stops into Supabase ===\n');
  const stats = { routes: 0, stops: 0, routeStops: 0 };

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('-with-stops.xlsx'))
    .sort();

  console.log(`Found ${files.length} with-stops files\n`);

  for (const file of files) {
    console.log(`Importing: ${file}`);
    try {
      await importStopsFile(path.join(DATA_DIR, file), stats);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  console.log('\n=== Routes+Stops Import Summary ===');
  console.log(`Routes:       ${routeCache.size}`);
  console.log(`Stops:        ${stopCache.size}`);
  console.log(`Route-stops:  ${stats.routeStops}`);
}

run().catch(err => { console.error(err); process.exit(1); });
