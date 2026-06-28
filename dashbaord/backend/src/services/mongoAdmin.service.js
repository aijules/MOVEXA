import bcrypt from 'bcryptjs';
import { getDb } from '../config/db.js';
import { env } from '../config/env.js';
import { permissionsFor, ROLES } from '../config/roles.js';

const collectionAliases = {
  admins: ['adminusers', 'admin_users', 'admins'],
  audit: ['auditlogs', 'audit_logs'],
  routes: ['routes', 'routepatterns', 'lines'],
  stops: ['stops'],
  paths: ['routepaths', 'paths', 'route_paths', 'routepatterns'],
  schedules: ['schedules', 'stoptimes'],
  fleet: ['vehicles', 'fleet'],
  drivers: ['drivers'],
  trips: ['trips'],
  eta: ['etapredictions', 'eta_predictions', 'etas'],
  tickets: ['tickets'],
  payments: ['payments'],
  incidents: ['incidents', 'alerts'],
  feedback: ['feedback', 'feedbacks'],
  imports: ['importjobs', 'import_jobs', 'importruns'],
  settings: ['systemsettings', 'system_settings', 'settings']
};

export async function listCollections() {
  return getDb().listCollections().toArray();
}

export async function resolveCollection(key) {
  const names = (await listCollections()).map((item) => item.name);
  const match = (collectionAliases[key] || [key]).find((name) => names.includes(name));
  return match ? getDb().collection(match) : null;
}

export async function collectionStats() {
  const names = (await listCollections()).map((item) => item.name);
  const entries = await Promise.all(names.map(async (name) => [name, await getDb().collection(name).estimatedDocumentCount()]));
  return Object.fromEntries(entries);
}

export function escapeRegex(input = '') {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function getRouteId(item = {}) {
  return item.routeId || item.route || item.Route || item.id || item.shortName || item.name || String(item._id || '');
}

export function getCoordinates(item = {}) {
  const coords = item.location?.coordinates || item.position?.coordinates || item.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) return coords.map(Number);
  const lon = item.lon ?? item.lng ?? item.longitude ?? item.End_Lon;
  const lat = item.lat ?? item.latitude ?? item.End_Lat;
  if (lon !== undefined && lat !== undefined) return [Number(lon), Number(lat)];
  return null;
}

export function getPathCoordinates(path = {}, route = null) {
  const direct = path.geometry?.coordinates || path.path?.coordinates || path.coordinates || path.polyline;
  if (Array.isArray(direct) && Array.isArray(direct[0])) return direct.map(([lon, lat]) => [Number(lon), Number(lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  const stops = normalizeArray(route?.stops).map((stop) => stop.location?.coordinates || stop.coordinates).filter(Boolean);
  return stops;
}

export async function paginateCollection(key, { page = 1, limit = 20, search = '', filter = {}, sort = { createdAt: -1, _id: -1 } } = {}) {
  const collection = await resolveCollection(key);
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  if (!collection) {
    return { data: [], pagination: { page: safePage, limit: safeLimit, total: 0, pages: 0 } };
  }
  const query = { ...filter };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    query.$or = [
      { routeId: rx }, { stopId: rx }, { name: rx }, { longName: rx }, { shortName: rx },
      { plate: rx }, { institution: rx }, { status: rx }, { type: rx }, { email: rx }, { action: rx }
    ];
  }
  const [data, total] = await Promise.all([
    collection.find(query).sort(sort).skip((safePage - 1) * safeLimit).limit(safeLimit).toArray(),
    collection.countDocuments(query)
  ]);
  return { data, pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) } };
}

export async function getMany(key, options = {}) {
  const collection = await resolveCollection(key);
  if (!collection) return [];
  return collection.find(options.filter || {}).sort(options.sort || {}).limit(options.limit || 1000).toArray();
}

export async function findOneByKey(key, fields = {}) {
  const collection = await resolveCollection(key);
  if (!collection) return null;
  return collection.findOne(fields);
}

export async function findAdminByEmail(email) {
  const admins = await resolveCollection('admins');
  if (!admins) return null;
  return admins.findOne({ email: String(email).toLowerCase() });
}

export async function authenticateAdmin(email, password) {
  const lower = String(email || '').toLowerCase();
  const dbUser = await findAdminByEmail(lower);
  if (dbUser?.status === 'suspended') return null;
  if (dbUser?.passwordHash || dbUser?.password) {
    const hash = dbUser.passwordHash || dbUser.password;
    const ok = String(hash).startsWith('$2') ? await bcrypt.compare(password, hash) : password === hash;
    if (!ok) return null;
    return {
      _id: dbUser._id,
      name: dbUser.name || dbUser.fullName || 'Admin User',
      email: dbUser.email,
      role: dbUser.role || ROLES.SUPER_ADMIN,
      permissions: permissionsFor(dbUser.role || ROLES.SUPER_ADMIN)
    };
  }
  if (lower === env.adminSeedEmail.toLowerCase() && password === env.adminSeedPassword) {
    return {
      _id: 'env-admin',
      name: env.adminSeedName,
      email: env.adminSeedEmail,
      role: ROLES.SUPER_ADMIN,
      permissions: permissionsFor(ROLES.SUPER_ADMIN)
    };
  }
  return null;
}

export async function getOverview() {
  const [routes, stops, fleet, trips, incidents, feedback, tickets, payments, imports, eta] = await Promise.all([
    getMany('routes', { limit: 5000 }),
    getMany('stops', { limit: 20000 }),
    getMany('fleet', { limit: 5000 }),
    getMany('trips', { limit: 5000 }),
    getMany('incidents', { limit: 1000, sort: { createdAt: -1 } }),
    getMany('feedback', { limit: 1000, sort: { createdAt: -1 } }),
    getMany('tickets', { limit: 5000 }),
    getMany('payments', { limit: 5000 }),
    getMany('imports', { limit: 20, sort: { createdAt: -1 } }),
    getMany('eta', { limit: 1000 })
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const activeVehicles = fleet.filter((v) => ['active', 'in_service', 'delayed'].includes(String(v.status || '').toLowerCase())).length;
  const activeTrips = trips.filter((t) => t.isActive === true || ['active', 'in_progress'].includes(String(t.status || '').toLowerCase())).length;
  const delayedTripsList = trips.filter((t) => toNumber(t.delayMinutes || t.delay) > 0 || String(t.status || '').toLowerCase() === 'delayed').slice(0, 8);
  const incidentsToday = incidents.filter((i) => String(i.createdAt || i.startTime || '').startsWith(today)).length;
  const ticketToday = tickets.filter((t) => String(t.createdAt || t.date || '').startsWith(today));
  const paidToday = payments.filter((p) => String(p.createdAt || p.date || '').startsWith(today) && !['failed', 'refunded'].includes(String(p.status || '').toLowerCase()));
  const revenueToday = [...ticketToday, ...paidToday].reduce((sum, item) => sum + toNumber(item.amount || item.fare || item.price), 0);
  const avgOcc = fleet.length ? Math.round(fleet.reduce((sum, v) => sum + toNumber(v.occupancyPercent ?? v.occupancy), 0) / fleet.length) : 0;
  const avgDelay = trips.length ? Math.round(trips.reduce((sum, t) => sum + toNumber(t.delayMinutes || t.delay), 0) / trips.length) : 0;
  const etaAccuracy = eta.length ? Math.round(eta.reduce((sum, e) => sum + toNumber(e.accuracyPercent || e.confidence || 90), 0) / eta.length) : 92;
  const crowdedRoutes = buildCrowdedRoutes(routes, fleet);
  return {
    totalRoutes: routes.length,
    totalStops: stops.length,
    totalVehicles: fleet.length,
    activeVehicles,
    activeTrips,
    delayedTrips: delayedTripsList.length,
    incidentsToday,
    openIncidents: incidents.filter((i) => ['open', 'investigating'].includes(String(i.status || 'open').toLowerCase())).length,
    feedbackNew: feedback.filter((f) => ['new', 'open'].includes(String(f.status || 'new').toLowerCase())).length,
    ticketsSoldToday: ticketToday.length,
    revenueToday,
    averageOccupancy: avgOcc,
    averageDelayMinutes: avgDelay,
    etaAccuracyPercent: etaAccuracy,
    recentIncidents: incidents.slice(0, 6),
    recentFeedback: feedback.slice(0, 6),
    delayedTripsList,
    crowdedRoutes,
    importHealth: imports[0] || { status: 'no_recent_import', message: 'No import jobs found in database' },
    fleetStatus: summarizeBy(fleet, 'status'),
    etaTrend: trendFromCount(eta.length || 12, 92),
    ticketTrend: trendFromCount(ticketToday.length || 12, Math.max(1, Math.round((ticketToday.length || 10) / 6)))
  };
}

function summarizeBy(items, field) {
  return items.reduce((acc, item) => {
    const key = String(item[field] || 'unknown').toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildCrowdedRoutes(routes, fleet) {
  const byRoute = new Map();
  for (const vehicle of fleet) {
    const routeId = vehicle.routeId || vehicle.currentRoute || vehicle.assignedRoute || vehicle.route;
    if (!routeId) continue;
    const current = byRoute.get(routeId) || { routeId, vehicles: 0, occupancy: 0 };
    current.vehicles += 1;
    current.occupancy += toNumber(vehicle.occupancyPercent ?? vehicle.occupancy);
    byRoute.set(routeId, current);
  }
  const routeNames = new Map(routes.map((route) => [getRouteId(route), route.longName || route.name || getRouteId(route)]));
  return [...byRoute.values()].map((item) => ({
    ...item,
    routeName: routeNames.get(item.routeId) || item.routeId,
    averageOccupancy: Math.round(item.occupancy / Math.max(1, item.vehicles))
  })).sort((a, b) => b.averageOccupancy - a.averageOccupancy).slice(0, 8);
}

function trendFromCount(count, base) {
  return Array.from({ length: 8 }, (_, index) => ({ label: `${index + 1}`, value: Math.max(0, Math.round(base + Math.sin(index) * count)) }));
}
