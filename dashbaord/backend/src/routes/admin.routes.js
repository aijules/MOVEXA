import { Router } from 'express';
import { z } from 'zod';
import { authenticateAdmin, collectionStats, findOneByKey, getMany, getOverview, getRouteId, paginateCollection, resolveCollection } from '../services/mongoAdmin.service.js';
import { signAdminToken, requireAdmin } from '../middleware/authMiddleware.js';
import { requirePermission } from '../middleware/rbacMiddleware.js';
import { getLiveVehicles } from '../services/simulation.service.js';
import { buildReports } from '../services/report.service.js';

export const adminRouter = Router();

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

adminRouter.post('/auth/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await authenticateAdmin(body.email, body.password);
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: signAdminToken(user), user });
  } catch (error) {
    if (error.name === 'ZodError') return res.status(400).json({ message: 'Valid email and password are required' });
    return next(error);
  }
});

adminRouter.get('/auth/me', requireAdmin, (req, res) => {
  res.json({ user: req.adminUser });
});

adminRouter.post('/auth/logout', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

adminRouter.get('/overview', requireAdmin, requirePermission('overview:read'), async (req, res, next) => {
  try {
    res.json(await getOverview());
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/overview/health', async (req, res) => {
  try {
    res.json({
      api: 'ok',
      database: 'connected',
      collections: await collectionStats(),
      simulation: 'polling',
      readOnlyDatabase: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({ api: 'ok', database: 'unavailable', message: error.message, timestamp: new Date().toISOString() });
  }
});

adminRouter.get('/live/vehicles', requireAdmin, requirePermission('live-map:read'), async (req, res, next) => {
  try {
    res.json(await getLiveVehicles(req.query));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/live/vehicles/:id', requireAdmin, requirePermission('live-map:read'), async (req, res, next) => {
  try {
    const live = await getLiveVehicles(req.query);
    const vehicle = live.vehicles.find((item) => item.vehicleId === req.params.id || item.plate === req.params.id);
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/routes/:id/stops', requireAdmin, requirePermission('routes:read'), async (req, res, next) => {
  try {
    const route = await findRoute(req.params.id);
    res.json({ data: route?.stops ? await hydrateRouteStops(route.stops) : [] });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/routes/:id/path', requireAdmin, requirePermission('routes:read'), async (req, res, next) => {
  try {
    const paths = await resolveCollection('paths');
    const path = paths ? await paths.findOne({ $or: [{ routeId: req.params.id }, { route: req.params.id }] }) : null;
    res.json(path || { routeId: req.params.id, geometry: { type: 'LineString', coordinates: [] }, status: 'missing' });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/routes/:id/map-data', requireAdmin, requirePermission('routes:read'), async (req, res, next) => {
  try {
    const route = await findRoute(req.params.id);
    const paths = await resolveCollection('paths');
    const path = paths ? await paths.findOne({ $or: [{ routeId: req.params.id }, { route: req.params.id }] }) : null;
    const stops = route?.stops ? await hydrateRouteStops(route.stops) : [];
    res.json({ route, path, stops });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/tickets/summary', requireAdmin, requirePermission('tickets:read'), async (req, res, next) => {
  try {
    const tickets = await getMany('tickets', { limit: 5000 });
    const revenue = tickets.reduce((sum, item) => sum + Number(item.amount || item.price || item.fare || 0), 0);
    res.json({ totalTickets: tickets.length, revenue, byStatus: groupBy(tickets, 'status') });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/payments/summary', requireAdmin, requirePermission('payments:read'), async (req, res, next) => {
  try {
    const payments = await getMany('payments', { limit: 5000 });
    const revenue = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    res.json({ totalPayments: payments.length, revenue, byMethod: groupBy(payments, 'method'), byStatus: groupBy(payments, 'status') });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/imports/data-quality', requireAdmin, requirePermission('imports:read'), async (req, res, next) => {
  try {
    const [routes, stops, paths, vehicles, schedules] = await Promise.all([
      getMany('routes', { limit: 5000 }),
      getMany('stops', { limit: 20000 }),
      getMany('paths', { limit: 5000 }),
      getMany('fleet', { limit: 5000 }),
      getMany('schedules', { limit: 5000 })
    ]);
    const pathIds = new Set(paths.map((p) => getRouteId(p)));
    const routeIds = new Set(routes.map((r) => getRouteId(r)));
    res.json({
      routesWithoutPaths: routes.filter((route) => !pathIds.has(getRouteId(route))).slice(0, 50),
      pathsWithoutRoutes: paths.filter((path) => !routeIds.has(getRouteId(path))).slice(0, 50),
      stopsWithoutCoordinates: stops.filter((stop) => !stop.location?.coordinates && !stop.coordinates).slice(0, 50),
      routesWithFewStops: routes.filter((route) => !Array.isArray(route.stops) || route.stops.length < 2).slice(0, 50),
      vehiclesWithoutPlate: vehicles.filter((vehicle) => !vehicle.plate && !vehicle.Plate).slice(0, 50),
      schedulesWithoutRoute: schedules.filter((schedule) => !schedule.routeId && !schedule.route).slice(0, 50)
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/reports/export', requireAdmin, requirePermission('reports:export'), async (req, res, next) => {
  try {
    const reports = await buildReports();
    const rows = reports.routePerformance || [];
    const csv = toCsv(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment('movexa-report.csv');
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/reports/:type?', requireAdmin, requirePermission('reports:read'), async (req, res, next) => {
  try {
    const reports = await buildReports();
    if (req.params.type && reports[req.params.type]) return res.json({ data: reports[req.params.type] });
    res.json(reports);
  } catch (error) {
    next(error);
  }
});

const resources = [
  ['routes', 'routes'],
  ['stops', 'stops'],
  ['paths', 'paths'],
  ['schedules', 'schedules'],
  ['fleet', 'fleet'],
  ['drivers', 'drivers'],
  ['trips', 'trips'],
  ['eta', 'eta'],
  ['tickets', 'tickets'],
  ['payments', 'payments'],
  ['incidents', 'incidents'],
  ['feedback', 'feedback'],
  ['imports/jobs', 'imports'],
  ['settings', 'settings'],
  ['audit-logs', 'audit-logs']
];

for (const [path, key] of resources) {
  adminRouter.get(`/${path}`, requireAdmin, requirePermission(`${key}:read`), listResource(key));
  adminRouter.get(`/${path}/:id`, requireAdmin, requirePermission(`${key}:read`), getResource(key));
}

function listResource(key) {
  return async (req, res, next) => {
    try {
      const filter = buildFilter(req.query);
      res.json(await paginateCollection(key, { page: req.query.page, limit: req.query.limit, search: req.query.search, filter }));
    } catch (error) {
      next(error);
    }
  };
}

function getResource(key) {
  return async (req, res, next) => {
    try {
      const collection = await resolveCollection(key);
      if (!collection) return res.status(404).json({ message: 'Collection not found' });
      const id = req.params.id;
      const item = await collection.findOne({ $or: [{ routeId: id }, { stopId: id }, { plate: id }, { _id: tryObjectId(id) }].filter((x) => x._id !== null) });
      if (!item) return res.status(404).json({ message: 'Record not found' });
      res.json(item);
    } catch (error) {
      next(error);
    }
  };
}

async function findRoute(id) {
  const routes = await resolveCollection('routes');
  if (!routes) return null;
  return routes.findOne({ $or: [{ routeId: id }, { shortName: id }, { name: id }, { _id: tryObjectId(id) }].filter((x) => x._id !== null) });
}

async function hydrateRouteStops(stops) {
  const collection = await resolveCollection('stops');
  if (!collection) return stops;
  const ids = stops.map((stop) => tryObjectId(stop.stopId)).filter(Boolean);
  const docs = ids.length ? await collection.find({ _id: { $in: ids } }).toArray() : [];
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  return stops.map((stop) => ({ ...stop, ...(byId.get(String(stop.stopId)) || {}) }));
}

function buildFilter(query) {
  const filter = {};
  for (const field of ['routeId', 'status', 'type', 'severity', 'rating', 'method', 'serviceDay', 'active', 'direction']) {
    if (query[field] !== undefined && query[field] !== '') filter[field] = query[field];
  }
  return filter;
}

function groupBy(items, field) {
  return items.reduce((acc, item) => {
    const key = String(item[field] || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function toCsv(rows) {
  if (!rows.length) return 'label,value\n';
  const headers = Object.keys(rows[0]);
  const body = rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? '')).join(',')).join('\n');
  return `${headers.join(',')}\n${body}\n`;
}

function tryObjectId(id) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  return new (awaitImportObjectId())(id);
}

function awaitImportObjectId() {
  return globalThis.__ObjectId;
}
