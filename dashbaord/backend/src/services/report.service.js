import { getMany, getOverview, getRouteId, toNumber } from './mongoAdmin.service.js';

export async function buildReports() {
  const [overview, routes, fleet, incidents, tickets, feedback, eta] = await Promise.all([
    getOverview(),
    getMany('routes', { limit: 5000 }),
    getMany('fleet', { limit: 5000 }),
    getMany('incidents', { limit: 2000 }),
    getMany('tickets', { limit: 5000 }),
    getMany('feedback', { limit: 2000 }),
    getMany('eta', { limit: 2000 })
  ]);
  return {
    routePerformance: routes.slice(0, 12).map((route) => ({
      routeId: getRouteId(route),
      routeName: route.longName || route.name || getRouteId(route),
      stops: Array.isArray(route.stops) ? route.stops.length : toNumber(route.stopCount),
      activeTrips: overview.activeTrips,
      averageDelay: overview.averageDelayMinutes
    })),
    occupancy: fleet.slice(0, 16).map((vehicle) => ({ label: vehicle.plate || vehicle.name || 'Vehicle', value: toNumber(vehicle.occupancyPercent ?? vehicle.occupancy) })),
    incidents: summarize(incidents, 'type'),
    tickets: summarize(tickets, 'type', 'amount'),
    feedback: summarize(feedback, 'rating'),
    etaAccuracy: eta.slice(0, 12).map((row, index) => ({ label: row.routeId || `ETA ${index + 1}`, value: toNumber(row.accuracyPercent || row.confidence || 90) }))
  };
}

function summarize(items, labelField, valueField = null) {
  const map = new Map();
  for (const item of items) {
    const label = String(item[labelField] || 'unknown');
    map.set(label, (map.get(label) || 0) + (valueField ? toNumber(item[valueField], 1) : 1));
  }
  return [...map.entries()].slice(0, 12).map(([label, value]) => ({ label, value }));
}

