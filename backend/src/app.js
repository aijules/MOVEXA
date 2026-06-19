const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { CLIENT_URL, NODE_ENV } = require('./config/env');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: "*",
  credentials: true,
}));
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
