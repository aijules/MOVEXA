// Read-only client for the MOVEXA backend (shared with the passenger app).
// The dashboard only READS data — it never mutates passenger records.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'movexa_admin_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(body?.error || body?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

// Backend wraps payloads as { success, data, ... } — unwrap to data.
export async function get(path) {
  const body = await api(path);
  if (body && typeof body === 'object' && 'data' in body) return body.data;
  return body;
}

export function getRaw(path) { return api(path); }

export function post(path, payload) {
  return api(path, { method: 'POST', body: JSON.stringify(payload) });
}

export function patch(path, payload) {
  return api(path, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function del(path) {
  return api(path, { method: 'DELETE' });
}
