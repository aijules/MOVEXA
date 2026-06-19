/**
 * Seed buses from ECOFLEET data + generate additional demo buses per route.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const fs   = require('fs');
const { supabase } = require('../src/config/supabase');
const { readWorkbook, sheetToRows, getCellValue } = require('../src/utils/excel');

const DATA_DIR = path.join(__dirname, '../../data');

const PLATE_PREFIXES = ['RAD','RAB','RAC','RAE','RAF','RAG'];

function makePlate(idx) {
  const prefix = PLATE_PREFIXES[idx % PLATE_PREFIXES.length];
  const num    = String(100 + Math.floor(idx / PLATE_PREFIXES.length)).padStart(3, '0');
  const letter = String.fromCharCode(65 + (idx % 26));
  return `${prefix} ${num} ${letter}`;
}

async function run() {
  console.log('=== Seeding buses ===\n');

  // Load routes to spread buses across them
  const { data: routes } = await supabase.from('routes').select('id,route_code').order('route_code');
  if (!routes || !routes.length) { console.error('No routes found. Run import-routes first.'); process.exit(1); }

  // Check ECOFLEET files
  const ecoFiles = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('ECOFLEET') && f.endsWith('.xlsx')).sort();
  let ecoPlates = [];

  for (const file of ecoFiles) {
    const wb   = readWorkbook(path.join(DATA_DIR, file));
    const rows = sheetToRows(wb.Sheets[wb.SheetNames[0]]);
    for (const row of rows) {
      const plate = getCellValue(row, 1) || getCellValue(row, 0);
      if (plate && /^R[A-Z]{2}/.test(plate.trim())) ecoPlates.push(plate.trim());
    }
  }
  ecoPlates = [...new Set(ecoPlates)].slice(0, 200);

  // Clear existing
  await supabase.from('buses').delete().gte('created_at', '2000-01-01');

  const buses = [];
  const routeCount = routes.length;

  // Use ecofleet plates where available, else generate
  const totalBuses = Math.max(ecoPlates.length, routeCount * 2, 60);
  for (let i = 0; i < totalBuses; i++) {
    const plate    = ecoPlates[i] || makePlate(i);
    const route    = routes[i % routeCount];
    buses.push({
      plate_number:     plate,
      bus_code:         `BUS${String(i + 1).padStart(3, '0')}`,
      capacity:         60,
      current_route_id: route.id,
      status:           'active',
    });
  }

  // Insert in batches
  const batchSize = 50;
  let inserted = 0;
  for (let i = 0; i < buses.length; i += batchSize) {
    const batch = buses.slice(i, i + batchSize);
    const { error } = await supabase.from('buses').upsert(batch, { onConflict: 'plate_number' });
    if (error) console.error(`  Batch error: ${error.message}`);
    else inserted += batch.length;
  }

  console.log(`✓ Seeded ${inserted} buses`);
}

run().catch(err => { console.error(err); process.exit(1); });
