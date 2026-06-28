/**
 * Quick connection test. Run AFTER applying fix-supabase-permissions.sql
 * Usage: node scripts/test-connection.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { supabase } = require('../src/config/supabase');

async function run() {
  console.log('\nTesting Supabase connection...');
  console.log(`URL: ${process.env.SUPABASE_URL}`);

  const tables = ['routes', 'stops', 'buses', 'trips', 'bus_locations'];
  let allOk = true;

  for (const table of tables) {
    const { count, error, status } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error || status >= 400) {
      console.log(`  ❌  ${table.padEnd(15)} status=${status} ${error?.message || ''}`);
      allOk = false;
    } else {
      console.log(`  ✅  ${table.padEnd(15)} count=${count}`);
    }
  }

  if (!allOk) {
    console.log('\n⚠  Permission errors detected.');
    console.log('   → Go to Supabase SQL Editor and run:');
    console.log('   backend/scripts/fix-supabase-permissions.sql\n');
  } else {
    console.log('\n✅ Connection OK. Run: npm run supabase:seed-all\n');
  }
}

run().catch(e => { console.error(e.message); process.exit(1); });
