import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';

import { MAX_JSON_BODY_BYTES, SESSION_INACTIVITY_MS } from '@kiosk/shared';
import { REPO_ROOT } from './config/env.js';
import { SqliteSessionStore } from './db/session-store.js';
import { PostgresSessionStore } from './db/postgres-session-store.js';
import { createLogger, createHttpLogger } from './utils/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { apiRateLimit, loginRateLimit } from './middleware/rate-limit.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { staffRoutes } from './routes/staff.js';
import { EventBus } from './services/event-bus.js';
import { AuditRepository } from './repositories/audit.js';
import { OrderService } from './domain/order-service.js';
import { AdminAuthService } from './services/admin-auth.js';
import {
  PgAdminRepository,
  PgAuditRepository,
  PgCatalogRepository,
  PgOrderRepository,
} from './postgres/repositories.js';
import { PgOrderService } from './postgres/order-service.js';

export function createApp({ env, db, logger = createLogger(env.logLevel) }) {
  const app = express();
  const isPostgres = env.databaseProvider === 'postgres' || db.dialect === 'postgres';
  const admins = isPostgres ? new PgAdminRepository(db) : null;
  const catalog = isPostgres ? new PgCatalogRepository(db) : null;
  const orders = isPostgres ? new PgOrderRepository(db) : null;
  const audit = isPostgres ? new PgAuditRepository(db, env.deploymentId) : new AuditRepository(db);

  if (env.trustProxy) {
    app.set('trust proxy', 1);
  }

  // Security headers. CSP is stricter in production builds (external scripts
  // only); the dev server needs inline scripts and websockets for HMR.
  const isDev = env.NODE_ENV === 'development';
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': isDev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': isDev ? ["'self'", 'ws:', 'http:', 'https:'] : ["'self'"],
          'worker-src': ["'self'", 'blob:'],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(requestIdMiddleware);
  app.use(createHttpLogger(logger));
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES }));
  app.use('/api', (req, res, next) => {
    const origin = req.get('Origin');
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!origin || !isMutation || !env.publicOrigins.length || env.publicOrigins.includes(origin)) {
      return next();
    }
    return res.status(403).json({
      error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed' },
      requestId: req.id,
    });
  });

  const sessionStore = isPostgres ? new PostgresSessionStore(db) : new SqliteSessionStore(db);
  const createSessionMiddleware = (name) =>
    session({
      name,
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true, // 30-minute inactivity window
      store: sessionStore,
      cookie: {
        httpOnly: true,
        sameSite: 'strict',
        secure: env.cookieSecure,
        maxAge: SESSION_INACTIVITY_MS,
      },
    });

  // Admin and station sessions are intentionally separate. This lets an
  // owner keep the supervisory console open while staff station devices run
  // concurrently in other tabs or on the LAN.
  const adminSession = createSessionMiddleware('sgkiosk.sid');
  app.use((req, res, next) => {
    if (req.path === '/api/v1/staff' || req.path.startsWith('/api/v1/staff/')) {
      return next();
    }
    return adminSession(req, res, next);
  });

  app.use(
    '/api',
    apiRateLimit({
      windowMs: env.API_RATE_LIMIT_WINDOW_MS,
      max: env.API_RATE_LIMIT_MAX,
    }),
  );

  const eventBus = new EventBus();
  const orderService = isPostgres
    ? new PgOrderService({ db, eventBus, audit, deploymentId: env.deploymentId })
    : new OrderService({ db, eventBus, audit });
  const authService = new AdminAuthService({ db, logger, admins, audit });
  const loginLimit = loginRateLimit({
    max: env.LOGIN_RATE_LIMIT_MAX,
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  });

  app.use('/api/v1', publicRoutes({ db, orderService, eventBus, logger, catalog, orders }));
  app.use(
    '/api/v1/admin',
    adminRoutes({
      db,
      authService,
      orderService,
      eventBus,
      logger,
      loginLimit,
      admins,
      catalog,
      orders,
      audit,
    }),
  );
  const staffSessionNames = ['launcher', 'cashier', 'kitchen', 'serving'];
  const staffSessions = new Map(
    staffSessionNames.map((station) => [
      station,
      createSessionMiddleware(`sgkiosk.staff.${station}.sid`),
    ]),
  );
  app.use('/api/v1/staff', (req, res, next) => {
    const cookieHeader = req.get('Cookie') || '';
    const cookieStation = staffSessionNames.find((station) =>
      cookieHeader.includes(`sgkiosk.staff.${station}.sid=`),
    );
    const requestedStation =
      req.get('X-Staff-Station') || req.query.station || cookieStation || 'launcher';
    const stationSession = staffSessions.get(requestedStation) || staffSessions.get('launcher');
    return stationSession(req, res, next);
  });
  app.use(
    '/api/v1/staff',
    staffRoutes({ db, authService, orderService, eventBus, logger, loginLimit, orders, admins }),
  );

  // Production: serve the built SPA with client-side routing fallback.
  const webDist = path.join(REPO_ROOT, 'apps', 'web', 'dist');
  if (env.NODE_ENV === 'production' && env.serveWeb && fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h', immutable: false }));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler(logger));

  return { app, db, eventBus, orderService, authService, logger };
}
