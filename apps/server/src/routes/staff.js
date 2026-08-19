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

async function stationOrder(orderService, orders, row, station, details) {
  const detail = details?.get(row.id) || (await orders.detail(row.id));
  const full = orderService.serializeOrder(detail);
  const base = {
    id: full.id,
    orderNumber: full.orderNumber,
    status: full.status,
    paymentStatus: full.paymentStatus,
    version: full.version,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    paymentConfirmedAt: full.paymentConfirmedAt,
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

export function staffRoutes({
  db,
  authService,
  orderService,
  eventBus,
  loginLimit,
  orders: ordersOverride,
  admins: adminsOverride,
}) {
  const router = Router();
  const orders = ordersOverride || new OrderRepository(db);
  router.use(noStore);

  router.post('/session', loginLimit.middleware, async (req, res, next) => {
    try {
      const input = parse(adminLoginSchema, req.body);
      const account = await authService.login({
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

  router.get('/session', requireAuth, resolveStaff(adminsOverride || db), (req, res) => {
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
      const station = req.get('X-Staff-Station') || req.query.station || 'launcher';
      res.clearCookie(`sgkiosk.staff.${station}.sid`);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  router.use(requireAuth, resolveStaff(adminsOverride || db));

  router.get('/workboard', async (req, res, next) => {
    try {
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const lanes = [
        ['payment', 'cashier'],
        ['preparation', 'kitchen'],
        ['handoff', 'serving'],
      ];
      const queues = await Promise.all(
        lanes.map(async ([lane, station]) => [
          lane,
          station,
          await orders.listStationQueue(station, {
            page,
            pageSize: 20,
            includeRecentConfirmed: lane !== 'payment',
            includeRecentCompleted: lane !== 'handoff',
          }),
        ]),
      );
      const allIds = queues.flatMap(([, , queue]) => queue.rows.map((row) => row.id));
      const details = orders.detailMany ? await orders.detailMany(allIds) : null;
      const payload = {};
      for (const [lane, station, queue] of queues) {
        payload[lane] = {
          orders: await Promise.all(
            queue.rows.map((row) => stationOrder(orderService, orders, row, station, details)),
          ),
          pagination: {
            page: queue.page,
            pages: queue.pages,
            total: queue.total,
            pageSize: queue.pageSize,
          },
        };
      }
      res.json({ ...payload, serverTime: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/queue/:station', async (req, res, next) => {
    try {
      const { station } = req.params;
      if (!STATIONS.includes(station)) throw badRequest('INVALID_STATION', 'Unknown station');
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const queue = await orders.listStationQueue(station, { page, pageSize: 20 });
      const details = orders.detailMany
        ? await orders.detailMany(queue.rows.map((row) => row.id))
        : null;
      const stationOrders = await Promise.all(
        queue.rows.map((row) => stationOrder(orderService, orders, row, station, details)),
      );
      res.json({
        station,
        orders: stationOrders,
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
    requireRoles('admin', 'staff'),
    requireCsrf,
    async (req, res, next) => {
      try {
        const input = parse(paymentPatchSchema, req.body);
        const order = await orders.findById(req.params.id);
        if (order?.status !== 'placed') {
          throw conflict('INVALID_STATION_ACTION', 'Cash can only be confirmed before preparation');
        }
        const updated = await orderService.confirmCash({
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

  router.patch(
    '/orders/:id/status',
    requireRoles('admin', 'staff'),
    requireCsrf,
    async (req, res, next) => {
      try {
        const input = parse(statusPatchSchema, req.body);
        const updated = await orderService.changeStatus({
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
    },
  );

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
