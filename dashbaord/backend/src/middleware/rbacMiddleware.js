import { hasPermission } from '../config/roles.js';

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.adminUser) return res.status(401).json({ message: 'Admin authentication required' });
    if (!hasPermission(req.adminUser.role, permission)) {
      return res.status(403).json({ message: 'You do not have permission to access this admin module' });
    }
    return next();
  };
}

