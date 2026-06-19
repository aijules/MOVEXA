/**
 * Convenience launcher — starts all three USSD services in one terminal:
 *   USSD Backend    :6000
 *   USSD Simulator  :6001
 *   USSD Dashboard  :6002
 * Zero dependencies (built-in child_process). Ctrl+C stops all.
 *
 * You can still run each service independently:
 *   node backend/server.js   |   node simulator/server.js   |   node dashboard/server.js
 */
const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'BACKEND  ', file: path.join(__dirname, 'backend', 'server.js'), color: '\x1b[36m' },
  { name: 'SIMULATOR', file: path.join(__dirname, 'simulator', 'server.js'), color: '\x1b[32m', env: { USSD_SKIP_BACKEND_AUTOSTART: 'true' } },
  { name: 'DASHBOARD', file: path.join(__dirname, 'dashboard', 'server.js'), color: '\x1b[35m' },
];
const RESET = '\x1b[0m';
const procs = [];

for (const s of services) {
  const p = spawn(process.execPath, [s.file], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...(s.env || {}) } });
  const tag = (line) => `${s.color}[${s.name}]${RESET} ${line}`;
  p.stdout.on('data', d => d.toString().split(/\r?\n/).filter(Boolean).forEach(l => console.log(tag(l))));
  p.stderr.on('data', d => d.toString().split(/\r?\n/).filter(Boolean).forEach(l => console.error(tag(l))));
  p.on('exit', code => console.log(tag(`exited (${code})`)));
  procs.push(p);
}

console.log('\n  MOVEXA USSD ecosystem starting…');
console.log('  Backend   → http://localhost:6000');
console.log('  Simulator → http://localhost:6001');
console.log('  Dashboard → http://localhost:6002\n');

function shutdown() { procs.forEach(p => { try { p.kill(); } catch {} }); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
