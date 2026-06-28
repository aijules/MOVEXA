const KIGALI_BOUNDS = { lngMin: 28, lngMax: 31.5, latMin: -3, latMax: -1 };

function isValidCoord(lng, lat) {
  return (
    Number.isFinite(lng) && Number.isFinite(lat) &&
    lng >= KIGALI_BOUNDS.lngMin && lng <= KIGALI_BOUNDS.lngMax &&
    lat >= KIGALI_BOUNDS.latMin && lat <= KIGALI_BOUNDS.latMax
  );
}

function parsePathString(value) {
  if (!value) return [];
  const nums = String(value)
    .split(',')
    .map(v => parseFloat(String(v).trim()))
    .filter(v => Number.isFinite(v));

  const coords = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const lng = nums[i];
    const lat = nums[i + 1];
    if (isValidCoord(lng, lat)) coords.push([lng, lat]);
  }
  return coords;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolatePolyline(coords, progressFraction) {
  if (!coords || coords.length === 0) return null;
  if (progressFraction <= 0) return coords[0];
  if (progressFraction >= 1) return coords[coords.length - 1];

  let totalDist = 0;
  const segments = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
    segments.push(d);
    totalDist += d;
  }

  const target = totalDist * progressFraction;
  let traveled = 0;
  for (let i = 0; i < segments.length; i++) {
    if (traveled + segments[i] >= target) {
      const fraction = (target - traveled) / segments[i];
      const lng = coords[i][0] + (coords[i + 1][0] - coords[i][0]) * fraction;
      const lat = coords[i][1] + (coords[i + 1][1] - coords[i][1]) * fraction;
      return [lng, lat];
    }
    traveled += segments[i];
  }
  return coords[coords.length - 1];
}

function calcBearing(from, to) {
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const dLng = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

module.exports = { isValidCoord, parsePathString, haversineMeters, interpolatePolyline, calcBearing };
