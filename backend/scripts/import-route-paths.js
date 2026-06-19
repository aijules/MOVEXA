/**
 * Import route path coordinates from *-with-path.xlsx into route_paths table.
 * Also creates stub stops (START/END) for path-only routes that have no stop data.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs   = require('fs');
const { supabase } = require('../src/config/supabase');
const { readWorkbook, sheetToRows, getCellValue } = require('../src/utils/excel');
const { parsePathString, haversineMeters } = require('../src/utils/geo');
const { parseRouteId } = require('../src/utils/normalize');

const DATA_DIR = path.join(__dirname, '../../data/Routes');

function calcDistKm(coords) {
  let d = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    d += haversineMeters(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]);
  }
  return parseFloat((d / 1000).toFixed(2));
}

function dedupe(coords) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const p = out[out.length - 1];
    if (coords[i][0] !== p[0] || coords[i][1] !== p[1]) out.push(coords[i]);
  }
  return out;
}

async function getRouteId(routeCode) {
  const { data } = await supabase.from('routes').select('id').eq('route_code', routeCode).maybeSingle();
  return data?.id || null;
}

async function ensureRouteWithStubs(routeCode, coords) {
  let routeId = await getRouteId(routeCode);
  if (!routeId) {
    // Create route
    const { data: r, error: re } = await supabase.from('routes')
      .insert({ route_code: routeCode, route_name: `Route ${routeCode}`, status: 'active' })
      .select('id').single();
    if (re) throw new Error(`create route ${routeCode}: ${re.message}`);
    routeId = r.id;

    // Create stub stops
    const startCoord = coords[0];
    const endCoord   = coords[coords.length - 1];
    const stubStart  = { stop_code: `STUB_${routeCode}_START`, stop_name: `${routeCode} - Start Terminal`,  latitude: startCoord[1], longitude: startCoord[0], is_active: true };
    const stubEnd    = { stop_code: `STUB_${routeCode}_END`,   stop_name: `${routeCode} - End Terminal`,    latitude: endCoord[1],   longitude: endCoord[0],   is_active: true };
    const { data: stops } = await supabase.from('stops')
      .upsert([stubStart, stubEnd], { onConflict: 'stop_code' }).select('id,stop_code');

    const distKm = calcDistKm(coords);
    const startId = stops.find(s => s.stop_code === stubStart.stop_code)?.id;
    const endId   = stops.find(s => s.stop_code === stubEnd.stop_code)?.id;
    const avgSpeedKph = 25;
    const estMins = Math.round((distKm / avgSpeedKph) * 60);

    await supabase.from('route_stops').upsert([
      { route_id: routeId, stop_id: startId, stop_order: 1, distance_from_start_km: 0,       estimated_minutes_from_start: 0 },
      { route_id: routeId, stop_id: endId,   stop_order: 2, distance_from_start_km: distKm,  estimated_minutes_from_start: estMins },
    ], { onConflict: 'route_id,stop_order' });

    // Update route with distance + duration
    await supabase.from('routes').update({
      total_distance_km: distKm,
      estimated_duration_minutes: estMins,
    }).eq('id', routeId);

    console.log(`  ⚠ Created stub route ${routeCode} (no named stops)`);
  }
  return routeId;
}

async function importPathFile(filePath, stats) {
  const wb   = readWorkbook(filePath);
  const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);

  const routeCoords = {};

  for (const row of rows) {
    const rawRoute = getCellValue(row, 0);
    if (!rawRoute) continue;
    const routeCode = parseRouteId(rawRoute);
    if (!routeCode || routeCode.length > 20) continue;
    if (['ROUTE','FORWARD','REVERSE'].includes(routeCode)) continue;

    const rawPath = getCellValue(row, 6);
    if (!rawPath) continue;
    const seg = parsePathString(rawPath);
    if (!seg.length) continue;

    if (!routeCoords[routeCode]) routeCoords[routeCode] = [];
    routeCoords[routeCode].push(...seg);
  }

  for (const [routeCode, raw] of Object.entries(routeCoords)) {
    if (raw.length < 2) continue;
    const coords  = dedupe(raw);
    const distKm  = calcDistKm(coords);
    const routeId = await ensureRouteWithStubs(routeCode, coords);

    // Delete old path then insert fresh
    await supabase.from('route_paths').delete().eq('route_id', routeId);
    const { error } = await supabase.from('route_paths').insert({
      route_id:    routeId,
      coordinates: coords,
      path_order:  1,
      distance_km: distKm,
    });
    if (error) throw new Error(`insert path ${routeCode}: ${error.message}`);

    // Update route distance/duration
    const avgSpeedKph = 25;
    await supabase.from('routes').update({
      total_distance_km:          distKm,
      estimated_duration_minutes: Math.round((distKm / avgSpeedKph) * 60),
    }).eq('id', routeId);

    stats.paths++;
    console.log(`  ✓ ${routeCode}: ${coords.length} coords, ${distKm} km`);
  }
}

async function buildFallbackPaths(stats) {
  // For routes that have stops but no path, build a straight-line path through stops
  const { data: routes } = await supabase.from('routes').select('id,route_code');
  const { data: existing } = await supabase.from('route_paths').select('route_id');
  const withPath = new Set((existing || []).map(p => p.route_id));

  const missing = (routes || []).filter(r => !withPath.has(r.id));
  if (!missing.length) return;

  console.log(`\nBuilding fallback paths for ${missing.length} routes without path data...`);

  for (const route of missing) {
    const { data: rs } = await supabase
      .from('route_stops')
      .select('stop_order, stops(latitude,longitude)')
      .eq('route_id', route.id)
      .order('stop_order');

    if (!rs || rs.length < 2) continue;
    const coords = rs.map(r => [r.stops.longitude, r.stops.latitude]);
    const distKm = calcDistKm(coords);
    await supabase.from('route_paths').insert({
      route_id:    route.id,
      coordinates: coords,
      path_order:  1,
      distance_km: distKm,
    });
    stats.fallbacks++;
    console.log(`  ⚠ Fallback path for ${route.route_code}: ${coords.length} points`);
  }
}

async function run() {
  console.log('=== Importing route paths into Supabase ===\n');
  const stats = { paths: 0, fallbacks: 0 };

  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.endsWith('-with-path.xlsx'))
    .sort();

  console.log(`Found ${files.length} with-path files\n`);

  for (const file of files) {
    console.log(`Importing: ${file}`);
    try {
      await importPathFile(path.join(DATA_DIR, file), stats);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  await buildFallbackPaths(stats);

  console.log('\n=== Path Import Summary ===');
  console.log(`Real paths:     ${stats.paths}`);
  console.log(`Fallback paths: ${stats.fallbacks}`);
}

run().catch(err => { console.error(err); process.exit(1); });
