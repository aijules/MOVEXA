/**
 * Zero-dependency .env loader.
 * Loads, in order (later files do NOT override earlier non-empty keys):
 *   1. ussd/backend/.env
 *   2. ussd/.env
 *   3. backend/.env   (reuse the main MOVEXA Supabase credentials)
 * This keeps the USSD service fully independent while letting it reuse the
 * existing project credentials with zero extra setup.
 */
const fs = require('fs');
const path = require('path');

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(__dirname, '..', '..', '..', 'backend', '.env'),
  ];
  for (const file of candidates) {
    const parsed = parseEnvFile(file);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === '') process.env[k] = v;
    }
  }
}

module.exports = { loadEnv };
