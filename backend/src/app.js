const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { CORS_ORIGINS, NODE_ENV } = require('./config/env');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
const corsOptions = {
  origin(origin, callback) {
    // Non-browser clients have no Origin. In local development, keep the
    // existing convenience of accepting localhost tools on any port.
    if (!origin || CORS_ORIGINS.includes(origin) || (NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

// Applied before every route. The cors package answers OPTIONS preflight
// requests here so they never fall through to a route or the 404 handler.
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (NODE_ENV !== 'test') app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true });
app.use('/api', limiter);

// Routes — Supabase-backed
app.use('/api/health',         require('./routes/health.routes'));
app.use('/api/routes',         require('./routes/routes.routes'));
app.use('/api/stops',          require('./routes/stops.routes'));
app.use('/api/geocode',        require('./routes/geocode.routes'));
app.use('/api/journeys',       require('./routes/journeys.routes'));
app.use('/api/vehicles',       require('./routes/vehicles.routes').router);
app.use('/api/tickets',        require('./routes/tickets.routes'));
app.use('/api/payments',       require('./routes/payments.routes'));
app.use('/api/alerts',         require('./routes/alerts.routes'));
app.use('/api/feedback',       require('./routes/feedback.routes'));
app.use('/api/ussd',           require('./routes/ussd.routes'));
app.use('/api/saved-journeys', require('./routes/saved-journeys.routes'));
app.use('/api/admin/auth',     require('./routes/staffAuth.routes'));
app.use('/api/admin',          require('./routes/admin.routes'));

// Legacy MongoDB routes kept as backup (not mounted by default)
// app.use('/api/auth',  require('./routes/auth.routes'));
// app.use('/api/lines', require('./routes/lines.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
