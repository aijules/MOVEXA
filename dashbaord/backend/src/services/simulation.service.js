import { getMany, getCoordinates, getPathCoordinates, getRouteId, normalizeArray, toNumber } from './mongoAdmin.service.js';

export async function getLiveVehicles(filters = {}) {
  const [vehicles, routes, paths, incidents] = await Promise.all([
    getMany('fleet', { limit: 200 }),
    getMany('routes', { limit: 1000 }),
    getMany('paths', { limit: 1000 }),
    getMany('incidents', { limit: 200, filter: { status: { $in: ['open', 'investigating'] } } }).catch(() => [])
  ]);
  const routeById = new Map(routes.map((route) => [getRouteId(route), route]));
  const pathByRoute = new Map(paths.map((path) => [getRouteId(path), path]));
  const activeRoutes = routes.slice(0, Math.max(1, Math.min(routes.length, vehicles.length || 12)));
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  let live = (vehicles.length ? vehicles : activeRoutes.map((route, index) => ({ plate: `DEMO-${index + 1}`, routeId: getRouteId(route), status: 'active' }))).map((vehicle, index) => {
    const route = routeById.get(vehicle.routeId || vehicle.currentRoute || vehicle.assignedRoute) || activeRoutes[index % activeRoutes.length] || {};
    const routeId = getRouteId(route);
    const path = pathByRoute.get(routeId) || {};
    const coords = getPathCoordinates(path, route);
    const progress = ((minutes + index * 7) % 120) / 120;
    const position = interpolatePosition(coords, progress) || getCoordinates(vehicle) || [30.0619, -1.9441];
    const stops = normalizeArray(route.stops).sort((a, b) => toNumber(a.sequence ?? a.End_Sequence) - toNumber(b.sequence ?? b.End_Sequence));
    const stopIndex = stops.length ? Math.min(stops.length - 1, Math.floor(progress * stops.length)) : 0;
    const incidentDelay = incidents.some((incident) => (incident.routeId || incident.route) === routeId) ? 8 : 0;
    const passengerCount = toNumber(vehicle.passengerCount ?? vehicle.Passengers ?? vehicle.passengers);
    const occupancyPercent = toNumber(vehicle.occupancyPercent ?? vehicle.occupancy, passengerCount ? Math.min(100, Math.round((passengerCount / 60) * 100)) : 0);
    return {
      vehicleId: String(vehicle._id || vehicle.plate || index),
      plate: vehicle.plate || vehicle.Plate || `BUS-${index + 1}`,
      status: incidentDelay ? 'delayed' : (vehicle.status || 'active'),
      routeId,
      routeName: route.longName || route.name || routeId,
      driver: vehicle.driver || { name: `Driver ${index + 1}`, phone: '+250 700 000 000' },
      position: { type: 'Point', coordinates: position },
      bearing: Math.round((progress * 360 + index * 13) % 360),
      progressPercent: Math.round(progress * 100),
      currentStop: formatStop(stops[Math.max(0, stopIndex - 1)]),
      nextStop: formatStop(stops[Math.min(stops.length - 1, stopIndex + 1)]),
      etaToNextStopMinutes: Math.max(1, Math.round((1 - (progress % 0.1) / 0.1) * 6)),
      delayMinutes: toNumber(vehicle.delayMinutes || vehicle.delay) + incidentDelay,
      occupancyPercent,
      occupancyStatus: occupancyLabel(occupancyPercent),
      passengerCount,
      lastUpdate: now.toISOString()
    };
  });
  if (filters.routeId) live = live.filter((item) => item.routeId === filters.routeId);
  if (filters.status) live = live.filter((item) => String(item.status).toLowerCase() === String(filters.status).toLowerCase());
  if (filters.occupancyStatus) live = live.filter((item) => item.occupancyStatus === filters.occupancyStatus);
  if (filters.delayedOnly === 'true') live = live.filter((item) => item.delayMinutes > 0);
  return { timestamp: now.toISOString(), vehicles: live.slice(0, 120) };
}

export function interpolatePosition(coords, progress) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (coords.length === 1) return coords[0];
  const exact = Math.max(0, Math.min(coords.length - 1, progress * (coords.length - 1)));
  const low = Math.floor(exact);
  const high = Math.min(coords.length - 1, low + 1);
  const ratio = exact - low;
  const [lon1, lat1] = coords[low];
  const [lon2, lat2] = coords[high];
  return [lon1 + (lon2 - lon1) * ratio, lat1 + (lat2 - lat1) * ratio];
}

function formatStop(stop = {}) {
  return {
    stopId: stop.stopId || stop.id || stop.name || 'Terminal',
    name: stop.name || stop.stopName || stop['End.Stop.with.Route'] || stop.stopId || 'Terminal'
  };
}

function occupancyLabel(percent) {
  if (percent <= 40) return 'low';
  if (percent <= 70) return 'moderate';
  if (percent <= 90) return 'crowded';
  return 'full';
}

