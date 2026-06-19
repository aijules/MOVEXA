/**
 * Staff authentication for the operations dashboard (additive, isolated).
 * Issues a real JWT. Passenger endpoints are untouched. Admin data endpoints stay
 * open so the existing passenger AdminView keeps working — the dashboard enforces
 * access via this login + its own role-based route guard.
 */
const router = require('express').Router();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET || 'movexa-staff-dev-secret';
const TOKEN_TTL = '12h';

const ALL = ['overview', 'live-map', 'routes', 'stops', 'schedules', 'buses', 'trips', 'eta', 'adaptive', 'incidents', 'feedback', 'ussd', 'payments', 'verify', 'reports', 'settings'];

// Built-in staff accounts (move to a `staff` table later without changing the API).
const STAFF = {
  admin:      { password: 'admin',      name: 'System Administrator', role: 'Admin',      permissions: ALL },
  dispatch:   { password: 'dispatch',   name: 'Dispatch Officer',     role: 'Dispatcher', permissions: ['overview', 'live-map', 'schedules', 'buses', 'trips', 'eta', 'adaptive', 'incidents', 'settings'] },
  supervisor: { password: 'supervisor', name: 'Route Supervisor',     role: 'Supervisor', permissions: ['overview', 'live-map', 'routes', 'stops', 'eta', 'payments', 'verify', 'reports', 'settings'] },
  support:    { password: 'support',    name: 'Customer Support',     role: 'Support',    permissions: ['overview', 'feedback', 'ussd', 'incidents', 'settings'] },
};

function publicUser(username, s) {
  return { username, name: s.name, role: s.role, permissions: s.permissions };
}

// POST /api/admin/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const key = String(username || '').trim().toLowerCase();
  const s = STAFF[key];
  if (!s || s.password !== password) {
    return res.status(401).json({ success: false, error: 'Invalid staff credentials' });
  }
  const user = publicUser(key, s);
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.json({ success: true, token, user });
});

// GET /api/admin/auth/me
router.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, user: { username: payload.username, name: payload.name, role: payload.role, permissions: payload.permissions } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
});

module.exports = router;
