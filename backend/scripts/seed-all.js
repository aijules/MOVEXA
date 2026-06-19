/**
 * Run all Supabase seed scripts in order.
 * Usage: node scripts/seed-all.js
 *        npm run supabase:seed-all
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  { name: 'Import routes + stops',  file: 'import-routes.js' },
  { name: 'Import route paths',     file: 'import-route-paths.js' },
  { name: 'Seed buses',             file: 'seed-buses.js' },
  { name: 'Seed drivers',           file: 'seed-drivers.js' },
  { name: 'Seed schedules',         file: 'seed-schedules.js' },
  { name: 'Seed trips',             file: 'seed-trips.js' },
  { name: 'Seed live vehicles',     file: 'seed-live-vehicles.js' },
  { name: 'Seed demo alerts',       file: 'seed-demo-alerts.js' },
];

async function run() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║      MOVEXA — Supabase Seed All        ║');
  console.log('╚════════════════════════════════════════╝\n');

  for (const script of SCRIPTS) {
    console.log(`\n━━━ ${script.name} ━━━`);
    try {
      execSync(`node ${path.join(__dirname, script.file)}`, { stdio: 'inherit' });
    } catch (err) {
      console.error(`\nFAILED: ${script.file}`);
      console.error('Fix the error above and re-run, or run scripts individually.');
      process.exit(1);
    }
  }

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   All seed scripts completed!          ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('Run next: npm run data:health');
}

run();
