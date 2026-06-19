import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { adminRouter } from './routes/admin.routes.js';
import { blockDatabaseWrites } from './middleware/readOnlyGuard.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

globalThis.__ObjectId = mongoose.Types.ObjectId;

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      if (!origin || env.frontendOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS origin not allowed'));
    },
    credentials: true
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/admin/auth/login', rateLimit({ windowMs: 60_000, max: 20 }));
  app.use('/api/admin', blockDatabaseWrites, adminRouter);
  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'Movexa Admin API' }));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
