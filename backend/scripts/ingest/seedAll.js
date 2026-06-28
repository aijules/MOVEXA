require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'importRoutesWithStops.js',
  'importRoutePaths.js',
  'importEcofleet.js',
  'generateSchedules.js',
  'validateImport.js',
];

for (const script of SCRIPTS) {
  console.log(`\n=== Running: ${script} ===`);
  try {
    execSync(`node ${path.join(__dirname, script)}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`FAILED: ${script}`);
    process.exit(1);
  }
}

console.log('\n=== All seed scripts completed ===');
