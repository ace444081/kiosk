import { Router } from 'express';
import { adminLoginSchema, paymentPatchSchema, statusPatchSchema } from '@kiosk/shared';
import { zodErrorToEnvelope } from '../middleware/errors.js';
import { badRequest, conflict } from '../utils/app-error.js';
import {
  noStore,
  requireAuth,
  requireCsrf,
  requireRoles,
  resolveStaff,
} from '../middleware/auth.js';
import { OrderRepository } from '../repositories/orders.js';

const STATIONS = ['cashier', 'kitchen', 'serving'];

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const envelope = zodErrorToEnvelope(result.error);
    throw badRequest(envelope.code, envelope.message, envelope.fieldErrors);
  }
  return result.data;
}

function sessionPayload(req, account) {
  return {
    authenticated: true,
    username: account.username,
    role: account.role,
    csrfToken: req.session.csrfToken,
    expiresAt: new Date(req.session.absExpiresAt).toISOString(),
  };
}

function stationOrder(orderService, orders, row, station) {
  const full = orderService.serializeOrder(orders.detail(row.id));
  const base = {
    id: full.id,
    orderNumber: full.orderNumber,
    status: full.status,
    paymentStatus: full.paymentStatus,
    version: full.version,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    preparingAt: full.preparingAt,
    readyAt: full.readyAt,
    completedAt: full.completedAt,
    itemCount: full.itemCount,
    items: full.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      addons: item.addons.map((addon) => addon.name),
      options: item.options.map((option) => option.name),
    })),
  };
  if (station === 'cashier') base.totalCentavos = full.totalCentavos;
  return base;
}

export function staffRoutes({ db, authService, orderService, eventBus, loginLimit }) {
  const router = Router();
  const orders = new OrderRepository(db);
  router.use(noStore);

  router.post('/session', loginLimit.middleware, async (req, res, next) => {
    try {
      const input = parse(adminLoginSchema, req.body);
      const account = authService.login({
        username: input.username,
        password: input.password,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id,
      });
      loginLimit.limiter.recordSuccess(req.ip, input.username);
      await authService.establishSession(req, account);
      res.json(sessionPayload(req, account));
    } catch (error) {
      if (error.code === 'INVALID_CREDENTIALS') {
        loginLimit.limiter.recordFailure(req.ip, req.body?.username || '');
      }
      next(error);
    }
  });

  router.get('/session', requireAuth, resolveStaff(db), (req, res) => {
    res.json(sessionPayload(req, req.staff));
  });

  router.delete('/session', requireAuth, async (req, res, next) => {
    try {
      await authService.logout({
        req,
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.clearCookie('sgkiosk.staff.sid');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAuth, resolveStaff(db));

  router.get('/queue/:station', (req, res, next) => {
    try {
      const { station } = req.params;
      if (!STATIONS.includes(station)) throw badRequest('INVALID_STATION', 'Unknown station');
      if (req.staff.role !== 'admin' && req.staff.role !== station) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Your role cannot view this station' },
          requestId: req.id,
        });
      }
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const queue = orders.listStationQueue(station, { page, pageSize: 20 });
      res.json({
        station,
        orders: queue.rows.map((row) => stationOrder(orderService, orders, row, station)),
        pagination: {
          page: queue.page,
          pages: queue.pages,
          total: queue.total,
          pageSize: queue.pageSize,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/orders/:id/payment',
    requireRoles('admin', 'cashier'),
    requireCsrf,
    (req, res, next) => {
      try {
        const input = parse(paymentPatchSchema, req.body);
        const order = orders.findById(req.params.id);
        if (order?.status !== 'placed') {
          throw conflict('INVALID_STATION_ACTION', 'Cash can only be confirmed before preparation');
        }
        const updated = orderService.confirmCash({
          orderId: req.params.id,
          version: input.version,
          actor: req.staff.username,
          actorRole: req.staff.role,
          requestId: req.id,
          ip: req.ip,
        });
        res.json({ order: updated });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch('/orders/:id/status', requireCsrf, (req, res, next) => {
    try {
      const input = parse(statusPatchSchema, req.body);
      const current = orders.findById(req.params.id);
      const role = req.staff.role;
      const allowed =
        role === 'admin' ||
        (role === 'cashier' && input.status === 'cancelled' && current?.status === 'placed') ||
        (role === 'kitchen' && ['preparing', 'ready'].includes(input.status)) ||
        (role === 'serving' && input.status === 'completed');
      if (!allowed) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Your role cannot perform this transition' },
          requestId: req.id,
        });
      }
      const updated = orderService.changeStatus({
        orderId: req.params.id,
        newStatus: input.status,
        version: input.version,
        actor: req.staff.username,
        actorRole: req.staff.role,
        requestId: req.id,
        ip: req.ip,
      });
      res.json({ order: updated });
    } catch (error) {
      next(error);
    }
  });

  router.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (record) => {
      res.write(`id: ${record.seq}\n`);
      res.write(`event: refresh\n`);
      res.write(`data: ${JSON.stringify({ refresh: true })}\n\n`);
    };
    const unsubscribe = eventBus.subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
