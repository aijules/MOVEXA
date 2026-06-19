import { env } from '../config/env.js';

export function blockDatabaseWrites(req, res, next) {
  if (!env.readOnlyDatabase) return next();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.path.includes('/auth/login') && !req.path.includes('/auth/logout')) {
    return res.status(423).json({
      message: 'Database mutation is disabled for this build. Existing MongoDB data is used read-only.'
    });
  }
  return next();
}

