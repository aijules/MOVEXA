/**
 * MOVEXA USSD menu state machine.
 *
 * The USSD protocol is stateless on the server: all session state is encoded
 * in the accumulating `text` field (Africa's Talking convention), e.g.
 * "1*Kacyiru*CBD". We split it into `parts` and branch.
 *
 * Returns { response, type } where response is the full body (prefixed with
 * "CON " to continue or "END " to terminate) and type is 'CON' | 'END'.
 *
 * Reads the EXISTING MOVEXA Supabase tables (routes, stops, route_stops,
 * schedules, incidents, trips) — never modifies them.
 */
const { select, ilikeValue } = require('./sb');

/* ── helpers ─────────────────────────────────────────── */
function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}
function hhmmToMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + (m || 0);
}
function minutesToHHMM(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Friendly route label that avoids "104F Route 104F" duplication. */
function routeLabel(r) {
  const code = r.route_code || '';
  const name = r.route_name || '';
  if (!name) return code;
  if (name.includes(code)) return name;          // name already carries the code
  return `${code} ${name}`.trim();
}

/** Distance-based fare estimate in RWF (matches Kigali Bus Service bands). */
function estimateFare(distanceKm) {
  if (!distanceKm || distanceKm <= 0) return 300;
  if (distanceKm <= 3) return 200;
  if (distanceKm <= 7) return 300;
  if (distanceKm <= 15) return 400;
  if (distanceKm <= 25) return 600;
  return 800;
}

/** Resolve a free-text stop name to candidate stop IDs. */
async function findStopIds(name) {
  const rows = await select(`stops?stop_name=ilike.${ilikeValue(name)}&is_active=eq.true&select=id,stop_name&limit=6`);
  return rows;
}

/**
 * Find routes that serve BOTH a boarding and a destination stop, in the
 * correct direction (destination further along the route than boarding).
 * Returns enriched route objects with boarding/dest offsets.
 */
async function findConnectingRoutes(fromName, toName) {
  const [fromStops, toStops] = await Promise.all([findStopIds(fromName), findStopIds(toName)]);
  if (!fromStops.length || !toStops.length) return { error: 'stops', fromStops, toStops };

  const fromIds = fromStops.map(s => s.id);
  const toIds = toStops.map(s => s.id);

  const [fromRS, toRS] = await Promise.all([
    select(`route_stops?stop_id=in.(${fromIds.join(',')})&select=route_id,estimated_minutes_from_start,stop_order`),
    select(`route_stops?stop_id=in.(${toIds.join(',')})&select=route_id,estimated_minutes_from_start,stop_order`),
  ]);
  if (!fromRS.length || !toRS.length) return { error: 'route', fromStops, toStops };

  const fromMap = {};
  for (const r of fromRS) {
    const cur = fromMap[r.route_id];
    if (!cur || r.estimated_minutes_from_start < cur) fromMap[r.route_id] = r.estimated_minutes_from_start;
  }
  const toMap = {};
  for (const r of toRS) {
    const cur = toMap[r.route_id];
    if (cur == null || r.estimated_minutes_from_start > cur) toMap[r.route_id] = r.estimated_minutes_from_start;
  }

  const commonIds = Object.keys(fromMap).filter(rid => toMap[rid] != null && toMap[rid] > fromMap[rid]);
  if (!commonIds.length) return { error: 'route', fromStops, toStops };

  const routes = await select(
    `routes?id=in.(${commonIds.join(',')})&select=id,route_code,route_name,total_distance_km,estimated_duration_minutes&limit=3`
  );

  return {
    routes: routes.map(r => ({
      ...r,
      boardingOffset: Math.round(fromMap[r.id] || 0),
      destOffset: Math.round(toMap[r.id] || 0),
      travelMins: Math.max(1, Math.round((toMap[r.id] || 0) - (fromMap[r.id] || 0))),
    })),
    fromStop: fromStops[0],
    toStop: toStops[0],
  };
}

/** Upcoming departure clock-times at the route's start, as "HH:MM". */
async function nextDepartures(routeId, limit = 4) {
  const rows = await select(
    `schedules?route_id=eq.${routeId}&is_active=eq.true&select=departure_time&order=departure_time.asc`
  );
  const now = nowMinutes();
  return rows
    .map(s => hhmmToMinutes(s.departure_time))
    .filter(m => m >= now)
    .slice(0, limit);
}

/** Live delay status for a route today (best-effort; tolerant if table absent). */
async function delayStatus(routeId) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await select(
      `trips?route_id=eq.${routeId}&service_date=eq.${today}&select=delay_minutes&order=delay_minutes.desc&limit=1`
    );
    const d = rows?.[0]?.delay_minutes || 0;
    if (d > 10) return `Delayed ~${d} min`;
    if (d > 3) return `Minor delay ~${d} min`;
    return 'On time';
  } catch { return 'On time'; }
}

const MAIN_MENU =
`CON Welcome to MOVEXA
1. Check Bus ETA
2. Journey Planner
3. Service Alerts
4. Fare Information
5. Nearby Stops
6. Saved Journeys
7. About MOVEXA
8. Buy Ticket (MoMo)
9. Check Payment`;

const MOVEXA_API = () => (process.env.MOVEXA_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

async function api(path, options = {}) {
  const res = await fetch(`${MOVEXA_API()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Payment service error (${res.status})`);
  return body;
}

async function startUssdPayment(routeCode, phone) {
  const routes = await select(`routes?route_code=ilike.${ilikeValue(routeCode)}&select=route_code,origin_name,destination_name,total_distance_km&limit=1`);
  if (!routes.length) throw new Error(`Route ${routeCode} not found`);
  const products = await select('fare_products?name=eq.Single%20Trip&is_active=eq.true&select=id,name&limit=1');
  if (!products.length) throw new Error('Single Trip fare is unavailable');
  const route = routes[0];
  return api('/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({
      fareProductId: products[0].id,
      phone,
      fareAmount: estimateFare(route.total_distance_km),
      routeName: `Route ${route.route_code}: ${route.origin_name || ''} - ${route.destination_name || ''}`,
      source: 'ussd',
      channel: 'MOMO',
    }),
  });
}

/* ── main handler ────────────────────────────────────── */
async function handleUssd({ text = '', phoneNumber = '', recentSearches = [] }) {
  const parts = String(text).split('*').filter(s => s !== '');
  const back = (v) => v === '0';

  // Main menu
  if (parts.length === 0) return { response: MAIN_MENU, type: 'CON' };

  /* ── 1. Check Bus ETA ── */
  if (parts[0] === '1') {
    if (parts.length === 1)
      return { response: 'CON Check Bus ETA\nEnter your boarding stop:\n(e.g. Kacyiru, Remera)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    if (parts.length === 2)
      return { response: `CON Boarding: ${parts[1]}\nEnter destination stop:\n(e.g. CBD, Kabuga)\n\n0. Main Menu`, type: 'CON' };
    if (back(parts[2])) return { response: 'CON Check Bus ETA\nEnter your boarding stop:\n\n0. Main Menu', type: 'CON' };

    const res = await findConnectingRoutes(parts[1], parts[2]);
    if (res.error)
      return { response: `END No bus found from\n${parts[1]} to ${parts[2]}.\nCheck the stop names\nand try again.`, type: 'END' };

    const r = res.routes[0];
    const [deps, delay] = await Promise.all([nextDepartures(r.id, 4), delayStatus(r.id)]);
    if (!deps.length)
      return { response: `END ${routeLabel(r)}\nNo more buses today.\nService 05:00-22:00.`, type: 'END' };

    // Arrival time at the boarding stop = route start departure + boarding offset.
    const arrivals = deps.map(d => minutesToHHMM(d + r.boardingOffset)).slice(0, 3);
    const etaMin = Math.max(0, deps[0] + r.boardingOffset - nowMinutes());
    return {
      response:
`END ${routeLabel(r)}
${parts[1]} -> ${parts[2]}
Next bus ETA: ~${etaMin} min
Arrives: ${arrivals.join(', ')}
Status: ${delay}
Travel time: ~${r.travelMins} min`,
      type: 'END',
    };
  }

  /* ── 2. Journey Planner ── */
  if (parts[0] === '2') {
    if (parts.length === 1)
      return { response: 'CON Journey Planner\nEnter origin stop:\n(e.g. Nyabugogo)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    if (parts.length === 2)
      return { response: `CON From: ${parts[1]}\nEnter destination:\n(e.g. Remera)\n\n0. Main Menu`, type: 'CON' };
    if (back(parts[2])) return { response: 'CON Journey Planner\nEnter origin stop:\n\n0. Main Menu', type: 'CON' };

    const res = await findConnectingRoutes(parts[1], parts[2]);
    if (res.error)
      return { response: `END No route found from\n${parts[1]} to ${parts[2]}.\nTry different stops.`, type: 'END' };

    const lines = [`END ${parts[1]} -> ${parts[2]}`];
    for (const r of res.routes.slice(0, 2)) {
      const frac = r.estimated_duration_minutes ? r.travelMins / r.estimated_duration_minutes : 0.5;
      const fare = estimateFare((r.total_distance_km || 10) * frac);
      const deps = await nextDepartures(r.id, 1);
      const next = deps.length ? minutesToHHMM(deps[0]) : 'see board';
      lines.push(`${r.route_code}: ~${r.travelMins}min ~${fare}RWF (${next})`);
    }
    return { response: lines.join('\n'), type: 'END' };
  }

  /* ── 3. Service Alerts ── */
  if (parts[0] === '3') {
    const alerts = await select(
      `incidents?is_active=eq.true&select=title,description,severity,type&order=starts_at.desc&limit=5`
    );
    if (parts.length === 1) {
      if (!alerts.length)
        return { response: 'END Service Alerts\nNo active alerts.\nAll routes running\nnormally. Safe travels!', type: 'END' };
      const list = alerts.map((a, i) => `${i + 1}. ${String(a.title).slice(0, 34)}`).join('\n');
      return { response: `CON Service Alerts (${alerts.length})\n${list}\n\nSelect number for detail\n0. Main Menu`, type: 'CON' };
    }
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    const a = alerts[parseInt(parts[1], 10) - 1];
    if (!a) return { response: 'END Invalid selection.', type: 'END' };
    const sev = String(a.severity || 'info').toUpperCase();
    const desc = String(a.description || 'No further details.').slice(0, 90);
    return { response: `END [${sev}] ${a.title}\n${desc}`, type: 'END' };
  }

  /* ── 4. Fare Information ── */
  if (parts[0] === '4') {
    if (parts.length === 1)
      return { response: 'CON Fare Information\nEnter route code:\n(e.g. 104, 201, 311)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };

    let routes = await select(
      `routes?route_code=ilike.${ilikeValue(parts[1])}&select=route_code,route_name,total_distance_km,origin_name,destination_name&limit=1`
    );
    if (!routes.length) return { response: `END Route "${parts[1]}" not found.`, type: 'END' };
    const r = routes[0];
    const fare = estimateFare(r.total_distance_km);
    const km = r.total_distance_km ? ` (${Math.round(r.total_distance_km)}km)` : '';
    return {
      response: `END Route ${r.route_code}\n${r.origin_name || ''} -> ${r.destination_name || ''}\nFare: ${fare} RWF${km}\nTrip cost: ${fare} RWF\nMoMo & Tap card accepted`,
      type: 'END',
    };
  }

  /* ── 5. Nearby Stops ── */
  if (parts[0] === '5') {
    if (parts.length === 1)
      return { response: 'CON Nearby Stops\nEnter area or stop name:\n(e.g. Remera, CBD)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };

    const q = ilikeValue(parts[1]);
    const stops = await select(
      `stops?or=(stop_name.ilike.${q},area.ilike.${q})&is_active=eq.true&select=stop_name,area&order=stop_name.asc&limit=6`
    );
    if (!stops.length) return { response: `END No stops found near\n"${parts[1]}".\nTry a district name.`, type: 'END' };
    const list = stops.map(s => `- ${s.stop_name}`).join('\n');
    return { response: `END Stops near "${parts[1]}":\n${list}`, type: 'END' };
  }

  /* ── 6. Saved Journeys (recent searches) ── */
  if (parts[0] === '6') {
    if (parts.length === 1) {
      if (!recentSearches.length)
        return { response: 'END Saved Journeys\nNo recent searches yet.\nUse Check Bus ETA (1)\nor Journey Planner (2).', type: 'END' };
      const list = recentSearches.map((j, i) => `${i + 1}. ${j.from} -> ${j.to}`).join('\n');
      return { response: `CON Recent Searches\n${list}\n\nSelect to replan\n0. Main Menu`, type: 'CON' };
    }
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    const j = recentSearches[parseInt(parts[1], 10) - 1];
    if (!j) return { response: 'END Invalid selection.', type: 'END' };

    const res = await findConnectingRoutes(j.from, j.to);
    if (res.error) return { response: `END ${j.from} -> ${j.to}\nNo route found now.`, type: 'END' };
    const r = res.routes[0];
    const [deps, delay] = await Promise.all([nextDepartures(r.id, 1), delayStatus(r.id)]);
    const etaMin = deps.length ? Math.max(0, deps[0] + r.boardingOffset - nowMinutes()) : null;
    return {
      response: `END ${j.from} -> ${j.to}\n${r.route_code}: ${etaMin != null ? `ETA ~${etaMin} min` : 'see board'}\nStatus: ${delay}\nTravel: ~${r.travelMins} min`,
      type: 'END',
    };
  }

  /* ── 7. About MOVEXA ── */
  if (parts[0] === '7') {
    return {
      response:
`END MOVEXA Smart Public
Transport System - Kigali

- ETA Prediction
- Adaptive Scheduling
- Live Bus Tracking
- USSD Accessibility

Dial *384*45343# anytime.`,
      type: 'END',
    };
  }

  /* ── 8. Buy a MoMo ticket ── */
  if (parts[0] === '8') {
    if (parts.length === 1)
      return { response: 'CON Buy Ticket with MoMo\nEnter route code:\n(e.g. 104, 201, 311)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    if (parts.length === 2)
      return { response: `CON Route ${parts[1]}\nEnter MoMo phone number:\n(e.g. 0788123456)\n\n0. Main Menu`, type: 'CON' };
    if (back(parts[2])) return { response: 'CON Buy Ticket with MoMo\nEnter route code:\n\n0. Main Menu', type: 'CON' };

    try {
      const payment = await startUssdPayment(parts[1], parts[2]);
      const ref = payment.data?.reference;
      return {
        response: `END Waiting for MoMo confirmation.\nApprove the PIN prompt.\nPayment ref: ${ref}\nDial again, option 9,\nto confirm your ticket.`,
        type: 'END',
      };
    } catch (e) {
      return { response: `END Payment could not start.\n${String(e.message).slice(0, 80)}`, type: 'END' };
    }
  }

  /* ── 9. Check a pending MoMo payment ── */
  if (parts[0] === '9') {
    if (parts.length === 1)
      return { response: 'CON Check MoMo Payment\nEnter payment reference:\n(MVX-...)\n\n0. Main Menu', type: 'CON' };
    if (back(parts[1])) return { response: MAIN_MENU, type: 'CON' };
    try {
      const checked = await api(`/payments/status/${encodeURIComponent(parts[1])}`);
      const state = checked.data?.status;
      if (state === 'success') {
        const ticketRef = checked.data?.ticket?.ticket_reference;
        return {
          response: `END Payment successful. Keep your MoMo confirmation SMS and ticket reference: ${ticketRef}. Show it to the supervisor.`,
          type: 'END',
        };
      }
      if (state === 'pending') return { response: 'END Waiting for MoMo confirmation.\nApprove the prompt and\ncheck again shortly.', type: 'END' };
      return { response: `END Payment ${state || 'not completed'}.\nPlease start a new payment.`, type: 'END' };
    } catch (e) {
      return { response: `END Payment reference not found.\nCheck it and try again.`, type: 'END' };
    }
  }

  return { response: `END Invalid option "${parts[0]}".\nDial *384*45343# to retry.`, type: 'END' };
}

module.exports = { handleUssd, estimateFare };
