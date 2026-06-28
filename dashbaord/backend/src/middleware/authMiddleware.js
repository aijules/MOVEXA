import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { permissionsFor, ROLES } from '../config/roles.js';

export function signAdminToken(adminUser) {
  return jwt.sign(
    {
      sub: String(adminUser._id || 'dev-admin'),
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role || ROLES.SUPER_ADMIN
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Admin authentication required' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.adminUser = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      permissions: permissionsFor(payload.role)
    };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired admin token' });
  }
}

