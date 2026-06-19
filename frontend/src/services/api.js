import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('movexa_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || err.message || 'Network error';
    return Promise.reject(new Error(msg));
  }
);

export const stopsApi = {
  search:       (q, limit = 10) => api.get('/api/stops/search', { params: { q, limit } }),
  nearby:       (lat, lng, radius = 1000) => api.get('/api/stops/nearby', { params: { lat, lng, radius } }),
  getById:      (id) => api.get(`/api/stops/${id}`),
  getDepartures:(id, time) => api.get(`/api/stops/${id}/departures`, { params: { time } }),
  getAll:       (q, limit = 20) => api.get('/api/stops', { params: { q, limit } }),
};

export const routesApi = {
  getAll:      (limit = 50) => api.get('/api/routes', { params: { limit } }),
  getById:     (id) => api.get(`/api/routes/${id}`),
  getStops:    (id) => api.get(`/api/routes/${id}/stops`),
  getPath:     (id) => api.get(`/api/routes/${id}/path`),
  getTimetable:(id) => api.get(`/api/routes/${id}/timetable`),
  getLiveVehicles: (id) => api.get(`/api/routes/${id}/live-vehicles`),
};

// Legacy alias — kept so existing stores don't break
export const linesApi = {
  getAll:  () => routesApi.getAll(),
  getById: (id) => routesApi.getById(id).then(r => ({ data: { line: r.data, patterns: [] } })),
  getStops:(id) => routesApi.getStops(id),
  getPath: (id) => routesApi.getPath(id).then(r => ({ data: { polyline: { coordinates: r.data?.coordinates || [] } } })),
};

export const journeysApi = {
  search:  (payload) => api.post('/api/journeys/search', payload),
  searchGET:(from, to, params = {}) => api.get('/api/journeys/search', { params: { from, to, ...params } }),
};

export const geocodeApi = {
  search: (q) => api.get('/api/geocode', { params: { q } }),
};

export const vehiclesApi = {
  getLive:        () => api.get('/api/vehicles/live'),
  getByRoute:     (routeId) => api.get(`/api/vehicles/by-route/${routeId}`),
  getLocation:    (id) => api.get(`/api/vehicles/${id}/location`),
  getEta:         (id) => api.get(`/api/vehicles/${id}/eta`),
};

export const ticketsApi = {
  getProducts: () => api.get('/api/tickets/products'),
  purchase:    (fareProductId, paymentMethod = 'mock', fareAmount) => api.post('/api/tickets/purchase', { fareProductId, paymentMethod, ...(fareAmount ? { fareAmount } : {}) }),
  getMyTickets:() => api.get('/api/tickets/my'),
};

export const paymentsApi = {
  // Push a MoMo prompt to the payer's phone. Returns { reference, status, ... }.
  initiate: (fareProductId, phone, fareAmount, channel, routeName, source = 'app') =>
    api.post('/api/payments/initiate', { fareProductId, phone, source, ...(fareAmount ? { fareAmount } : {}), ...(channel ? { channel } : {}), ...(routeName ? { routeName } : {}) }),
  // Poll a payment. Returns { status: 'pending'|'success'|'failed'|'expired', ticket }.
  status: (reference) => api.get(`/api/payments/status/${reference}`),
};

export const savedJourneysApi = {
  getAll:  () => api.get('/api/saved-journeys'),
  save:    (data) => api.post('/api/saved-journeys', data),
  remove:  (id) => api.delete(`/api/saved-journeys/${id}`),
};

export const alertsApi = {
  getAll: () => api.get('/api/alerts'),
};

export const feedbackApi = {
  submit: (data) => api.post('/api/feedback', data),
};

export const adminApi = {
  dataHealth:   () => api.get('/api/admin/data-health'),
  dashboard:    () => api.get('/api/admin/dashboard'),
  getRoutes:    () => api.get('/api/admin/routes'),
  importRuns:   () => api.get('/api/admin/import-runs').catch(() => ({ data: [] })),
  health:       () => api.get('/api/health'),
};

export default api;
