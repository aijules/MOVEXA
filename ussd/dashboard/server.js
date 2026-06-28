/**
 * MOVEXA USSD Management Dashboard — static file server + API proxy on :6002.
 * Zero dependencies. Serves the analytics dashboard SPA and PROXIES `/api/*`
 * through to the USSD backend on :6000, so the page only ever talks to its own
 * origin (no CORS, works behind tunnels/preview too).
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
require('../backend/lib/env').loadEnv();

const PORT = parseInt(process.env.USSD_DASHBOARD_PORT, 10) || 6002;
const BACKEND_URL = new URL(process.env.USSD_BACKEND_URL || `http://${process.env.USSD_BACKEND_HOST || 'localhost'}:${process.env.USSD_BACKEND_PORT || 6000}`);
const BACKEND_HOST = BACKEND_URL.hostname;
const BACKEND_PORT = Number(BACKEND_URL.port || (BACKEND_URL.protocol === 'https:' ? 443 : 80));
const SIMULATOR_URL = process.env.USSD_SIMULATOR_URL || 'http://localhost:6001';
const ROOT = __dirname;
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

http.createServer((req, res) => {
  const p0 = (req.url || '/').split('?')[0];
  if (p0 === '/ussd' || p0.startsWith('/api/')) return proxy(req, res);

  let p = decodeURIComponent(p0);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    if (p === '/index.html') data = Buffer.from(data.toString('utf8').replaceAll('__USSD_SIMULATOR_URL__', SIMULATOR_URL));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`✓ MOVEXA USSD Dashboard on http://localhost:${PORT} (API proxied to :${BACKEND_PORT})`));
