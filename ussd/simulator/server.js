/**
 * MOVEXA USSD Simulator — static file server + API proxy on :6001.
 * Zero dependencies. Serves the phone-simulator SPA and PROXIES `/ussd` and
 * `/api/*` through to the USSD backend on :6000. Proxying means the page only
 * ever talks to its own origin (no CORS, works behind tunnels/preview too).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
require('../backend/lib/env').loadEnv();

const PORT = parseInt(process.env.USSD_SIMULATOR_PORT, 10) || 6001;
const BACKEND_URL = new URL(process.env.USSD_BACKEND_URL || `http://${process.env.USSD_BACKEND_HOST || 'localhost'}:${process.env.USSD_BACKEND_PORT || 6000}`);
const BACKEND_HOST = BACKEND_URL.hostname;
const BACKEND_PORT = Number(BACKEND_URL.port || (BACKEND_URL.protocol === 'https:' ? 443 : 80));
const DASHBOARD_URL = process.env.USSD_DASHBOARD_URL || 'http://localhost:6002';
const ROOT = __dirname;
let managedBackend = null;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
};

function proxy(req, res) {
  const transport = BACKEND_URL.protocol === 'https:' ? https : http;
  const basePath = BACKEND_URL.pathname.replace(/\/$/, '');
  const opts = {
    protocol: BACKEND_URL.protocol, hostname: BACKEND_HOST, port: BACKEND_PORT,
    path: `${basePath}${req.url}`, method: req.method,
    headers: { ...req.headers, host: BACKEND_URL.host },
  };
  const pr = transport.request(opts, (br) => { res.writeHead(br.statusCode, br.headers); br.pipe(res); });
  pr.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: `USSD backend (:${BACKEND_PORT}) not reachable. Start it: node backend/server.js` }));
  });
  req.pipe(pr);
}

function portOpen(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(500);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function ensureBackend() {
  const localBackend = ['localhost', '127.0.0.1', '::1'].includes(BACKEND_HOST);
  if (!localBackend || process.env.USSD_SKIP_BACKEND_AUTOSTART === 'true' || await portOpen(BACKEND_HOST, BACKEND_PORT)) return;
  const file = path.join(__dirname, '..', 'backend', 'server.js');
  managedBackend = spawn(process.execPath, [file], {
    cwd: path.dirname(file),
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });
  console.log(`Starting required USSD backend on :${BACKEND_PORT}…`);
}

const server = http.createServer((req, res) => {
  const p0 = (req.url || '/').split('?')[0];
  // Forward API + USSD calls to the backend (same-origin from the browser's view).
  if (p0 === '/ussd' || p0.startsWith('/api/')) return proxy(req, res);

  let p = decodeURIComponent(p0);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (p === '/index.html') data = Buffer.from(data.toString('utf8').replaceAll('__USSD_DASHBOARD_URL__', DASHBOARD_URL));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

ensureBackend().finally(() => {
  server.listen(PORT, () => console.log(`✓ MOVEXA USSD Simulator on http://localhost:${PORT} (API proxied to :${BACKEND_PORT})`));
});

function shutdown() {
  if (managedBackend) managedBackend.kill();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
