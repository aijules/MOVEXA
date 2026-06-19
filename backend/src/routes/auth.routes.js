const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');
const { authenticate } = require('../middleware/auth');

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !password) return res.status(400).json({ success: false, error: 'name and password required' });

    const user = new User({ name, email, phone, passwordHash: password });
    await user.save();

    const token = signToken(user._id);
    res.status(201).json({ success: true, data: { user: { id: user._id, name, email, role: user.role }, accessToken: token } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, error: 'Email or phone already registered' });
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, error: 'email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const valid = await user.comparePassword(password);
    if (!valid) return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const token = signToken(user._id);
    res.json({ success: true, data: { user: { id: user._id, name: user.name, email: user.email, role: user.role }, accessToken: token } });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

module.exports = router;
