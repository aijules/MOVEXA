function normalizeStopName(name) {
  if (!name) return '';
  return String(name)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-\.]/g, '')
    .trim();
}

function makeStopCode(name) {
  return normalizeStopName(name)
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_\-]/g, '')
    .slice(0, 50);
}

function parseNumber(val) {
  const n = parseFloat(String(val).replace(/,/g, '.').trim());
  return Number.isFinite(n) ? n : null;
}

function parseRouteId(val) {
  if (!val) return null;
  return String(val).trim().toUpperCase();
}

function parseSequence(val) {
  const n = parseInt(val);
  return Number.isFinite(n) ? n : null;
}

module.exports = { normalizeStopName, makeStopCode, parseNumber, parseRouteId, parseSequence };
