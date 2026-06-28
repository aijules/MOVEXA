const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');
const User = require('../models/User');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user || !user.isActive) return res.status(401).json({ success: false, error: 'Invalid token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Token expired or invalid' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    next();
  };
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    User.findById(payload.sub).select('-passwordHash').then(user => {
      if (user && user.isActive) req.user = user;
      next();
    }).catch(() => next());
  } catch {
    next();
  }
}

module.exports = { authenticate, requireRole, optionalAuth };
