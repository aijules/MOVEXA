/**
 * MOVEXA USSD Management Dashboard — static file server + API proxy on :6002.
 * Zero dependencies. Serves the analytics dashboard SPA and PROXIES `/api/*`
 * through to the USSD backend on :6000, so the page only ever talks to its own
 * origin (no CORS, works behind tunnels/preview too).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.USSD_DASHBOARD_PORT, 10) || 6002;
const BACKEND_HOST = process.env.USSD_BACKEND_HOST || 'localhost';
const BACKEND_PORT = parseInt(process.env.USSD_BACKEND_PORT, 10) || 6000;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
};

function proxy(req, res) {
  const opts = {
    host: BACKEND_HOST, port: BACKEND_PORT, path: req.url, method: req.method,
    headers: { ...req.headers, host: `${BACKEND_HOST}:${BACKEND_PORT}` },
  };
  const pr = http.request(opts, (br) => { res.writeHead(br.statusCode, br.headers); br.pipe(res); });
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
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`✓ MOVEXA USSD Dashboard on http://localhost:${PORT} (API proxied to :${BACKEND_PORT})`));
