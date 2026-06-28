/**
 * Data health check — prints counts for all key tables.
 * Usage: node scripts/data-health-check.js
 *        npm run data:health
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

async function count(table) {
  const { count: c, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) return `ERROR: ${error.message}`;
  return c ?? 0;
}

async function countWhere(table, col, val) {
  const { count: c, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, val);
  if (error) return `ERROR: ${error.message}`;
  return c ?? 0;
}

function icon(n) {
  if (typeof n === 'string') return '❌';
  if (n === 0) return '⚠️ ';
  return '✅';
}

async function run() {
  const today = new Date().toISOString().split('T')[0];

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║       MOVEXA — Data Health Report            ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const checks = [
    ['routes',            await count('routes')],
    ['stops',             await count('stops')],
    ['route_stops',       await count('route_stops')],
    ['route_paths',       await count('route_paths')],
    ['buses (active)',    await countWhere('buses', 'status', 'active')],
    ['drivers',           await count('drivers')],
    ['schedules',         await count('schedules')],
    ['trips (today)',     await countWhere('trips', 'service_date', today)],
    ['trips (active)',    await countWhere('trips', 'status', 'active')],
    ['bus_locations',     await count('bus_locations')],
    ['incidents',         await count('incidents')],
    ['adaptive_actions',  await count('adaptive_actions')],
    ['fare_products',     await count('fare_products')],
    ['users',             await count('users')],
  ];

  let ok = 0, warn = 0;
  for (const [label, val] of checks) {
    const s = icon(val);
    console.log(`  ${s}  ${label.padEnd(22)} ${val}`);
    if (s === '✅') ok++; else warn++;
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(`  OK: ${ok}   Warnings/Errors: ${warn}`);
  console.log('──────────────────────────────────────────────\n');

  if (warn > 0) {
    console.log('▶  Run:  npm run supabase:seed-all\n');
  } else {
    console.log('✅ All data looks healthy. Start server: npm run dev\n');
  }
}

run().catch(err => { console.error(err.message); process.exit(1); });
