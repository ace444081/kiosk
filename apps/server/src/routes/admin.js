import { Router } from 'express';
import {
  adminLoginSchema,
  availabilityPatchSchema,
  auditLogQuerySchema,
  createProductSchema,
  listOrdersQuerySchema,
  listProductsQuerySchema,
  paymentPatchSchema,
  publicationPatchSchema,
  reportQuerySchema,
  statusPatchSchema,
} from '@kiosk/shared';
import { zodErrorToEnvelope } from '../middleware/errors.js';
import { badRequest, conflict, notFound } from '../utils/app-error.js';
import {
  requireAuth,
  requireCsrf,
  noStore,
  resolveStaff,
  requireRoles,
} from '../middleware/auth.js';
import { buildDailySummary } from '../domain/summary.js';
import { buildDashboardAnalytics } from '../services/dashboard-analytics.js';
import { createOperationsWorkbook } from '../services/operations-workbook.js';
import { CatalogRepository } from '../repositories/catalog.js';
import { OrderRepository } from '../repositories/orders.js';
import { AuditRepository } from '../repositories/audit.js';
import { EVENT_TYPES } from '../events/event-types.js';
import { buildSoaSummary } from '../services/soa-report.js';

function parseOrThrow(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const envelope = zodErrorToEnvelope(parsed.error);
    throw badRequest(envelope.code, envelope.message, envelope.fieldErrors);
  }
  return parsed.data;
}

function serializeProduct(product, categoryById) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryId: product.category_id,
    categoryName: categoryById.get(product.category_id)?.name_en || product.category_id,
    priceCentavos: product.price_centavos,
    imagePath: product.image_path,
    isAvailable: product.is_available === 1,
    isPublished: product.is_published === 1,
    version: product.version,
    updatedAt: product.updated_at,
  };
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function adminRoutes({
  db,
  authService,
  orderService,
  eventBus,
  logger,
  loginLimit,
  admins: adminsOverride,
  catalog: catalogOverride,
  orders: ordersOverride,
  audit: auditOverride,
}) {
  const router = Router();
  const admins = adminsOverride;
  const catalog = catalogOverride || new CatalogRepository(db);
  const orders = ordersOverride || new OrderRepository(db);
  const audit = auditOverride || new AuditRepository(db);

  // All admin responses are sensitive: never cache.
  router.use(noStore);

  // --- Session -------------------------------------------------------------
  router.post('/session', loginLimit.middleware, async (req, res, next) => {
    try {
      const input = parseOrThrow(adminLoginSchema, req.body);
      const admin = await authService.login({
        username: input.username,
        password: input.password,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        requestId: req.id,
      });
      loginLimit.limiter.recordSuccess(req.ip, input.username);
      await authService.establishSession(req, admin);
      logger.info({ actor: admin.username, requestId: req.id }, 'admin login success');
      res.json({
        authenticated: true,
        username: admin.username,
        role: admin.role,
        csrfToken: req.session.csrfToken,
        expiresAt: new Date(req.session.absExpiresAt).toISOString(),
      });
    } catch (err) {
      if (err.code === 'INVALID_CREDENTIALS') {
        loginLimit.limiter.recordFailure(req.ip, req.body?.username || '');
      }
      next(err);
    }
  });

  router.get('/session', async (req, res, next) => {
    try {
      if (!req.session?.adminId) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          requestId: req.id,
        });
      }
      const account = admins
        ? await admins.findById(req.session.adminId)
        : db
            .prepare('SELECT username, role, is_active FROM admins WHERE id = ?')
            .get(req.session.adminId);
      if (!account || account.is_active !== 1) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          requestId: req.id,
        });
      }
      res.json({
        authenticated: true,
        username: account.username,
        role: account.role,
        csrfToken: req.session.csrfToken,
        expiresAt: new Date(req.session.absExpiresAt).toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/session', async (req, res, next) => {
    try {
      await authService.logout({
        req,
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.clearCookie('sgkiosk.sid');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // Everything below is the supervisory console and is admin-only.
  router.use(requireAuth, resolveStaff(admins || db), requireRoles('admin'));

  // --- Orders --------------------------------------------------------------
  router.get('/orders', async (req, res, next) => {
    try {
      const filters = parseOrThrow(listOrdersQuerySchema, req.query);
      const rows = await orders.list(filters);
      const list = rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        businessDate: row.business_date,
        dailySequence: row.daily_sequence,
        status: row.status,
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status,
        locale: row.locale,
        totalCentavos: row.total_centavos,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        preparingAt: row.preparing_at || null,
        readyAt: row.ready_at || null,
        paymentConfirmedAt: row.payment_confirmed_at || null,
        completedAt: row.completed_at || null,
        cancelledAt: row.cancelled_at || null,
        itemCount: row.item_count ?? 0,
      }));
      res.json({ orders: list });
    } catch (err) {
      next(err);
    }
  });

  router.get('/orders/:id', async (req, res, next) => {
    try {
      const order = await orders.detail(req.params.id);
      if (!order) throw notFound('ORDER_NOT_FOUND', 'Order not found');
      res.json({ order: orderService.serializeOrder(order) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/orders/:id/status', requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(statusPatchSchema, req.body);
      const updated = await orderService.changeStatus({
        orderId: req.params.id,
        newStatus: input.status,
        version: input.version,
        actor: req.session.username,
        actorRole: req.staff.role,
        requestId: req.id,
        ip: req.ip,
      });
      res.json({ order: updated });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/orders/:id/payment', requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(paymentPatchSchema, req.body);
      const updated = await orderService.confirmCash({
        orderId: req.params.id,
        version: input.version,
        actor: req.session.username,
        actorRole: req.staff.role,
        requestId: req.id,
        ip: req.ip,
      });
      res.json({ order: updated });
    } catch (err) {
      next(err);
    }
  });

  // --- Products / availability ---------------------------------------------
  router.get('/products', requireAuth, async (req, res, next) => {
    try {
      const filters = parseOrThrow(listProductsQuerySchema, req.query);
      const rows = await catalog.searchProducts(filters);
      const categoryById = new Map((await catalog.listCategories()).map((c) => [c.id, c]));
      res.json({
        products: rows.map((p) => serializeProduct(p, categoryById)),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/products/:id/availability', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(availabilityPatchSchema, req.body);
      const product = await catalog.findProductById(req.params.id);
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      if (product.is_published !== 1 && input.isAvailable) {
        throw badRequest(
          'PRODUCT_NOT_PUBLISHED',
          'Publish the product before marking it available',
        );
      }
      if (product.version !== input.version) {
        const current = await catalog.findProductById(req.params.id);
        return res.status(409).json({
          error: {
            code: 'STALE_VERSION',
            message: 'Product availability was modified by another action',
          },
          product: {
            id: current.id,
            isAvailable: current.is_available === 1,
            version: current.version,
            updatedAt: current.updated_at,
          },
          requestId: req.id,
        });
      }
      const updated = await catalog.updateAvailability(
        req.params.id,
        input.isAvailable,
        input.version,
      );
      if (!updated)
        throw conflict('STALE_VERSION', 'Product availability was modified by another action');
      await audit.record({
        actor: req.session.username,
        action: 'PRODUCT_AVAILABILITY_CHANGED',
        targetType: 'product',
        targetId: updated.id,
        previousState: { isAvailable: product.is_available === 1, version: product.version },
        newState: { isAvailable: updated.is_available === 1, version: updated.version },
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      logger.info(
        {
          actor: req.session.username,
          productId: updated.id,
          isAvailable: updated.is_available,
          requestId: req.id,
        },
        'availability changed',
      );
      res.json({
        product: {
          id: updated.id,
          isAvailable: updated.is_available === 1,
          version: updated.version,
          updatedAt: updated.updated_at,
        },
      });
      eventBus.publish({
        type: EVENT_TYPES.AVAILABILITY_CHANGED,
        data: {
          productId: updated.id,
          isAvailable: updated.is_available === 1,
          version: updated.version,
          updatedAt: updated.updated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/menu-config', requireAuth, async (req, res, next) => {
    try {
      res.json({
        categories: (await catalog.listCategories()).map((category) => ({
          id: category.id,
          nameEn: category.name_en,
          nameFil: category.name_fil,
          sortOrder: category.sort_order,
        })),
        addons: (await catalog.listAddons()).map((addon) => ({
          id: addon.id,
          nameEn: addon.name_en,
          nameFil: addon.name_fil,
          priceCentavos: addon.price_centavos,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/products', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(createProductSchema, req.body);
      if (await catalog.findProductById(input.sku)) {
        throw conflict('PRODUCT_EXISTS', 'A product with this SKU already exists');
      }
      if (!(await catalog.listCategories()).some((category) => category.id === input.categoryId)) {
        throw badRequest('CATEGORY_NOT_FOUND', 'Choose an existing category');
      }
      const addonIds = new Set((await catalog.listAddons()).map((addon) => addon.id));
      const unknownAddon = input.addonIds.find((addonId) => !addonIds.has(addonId));
      if (unknownAddon) throw badRequest('ADDON_NOT_FOUND', 'Choose existing add-ons only');

      const product = await catalog.createProduct(input);
      const categoryById = new Map(
        (await catalog.listCategories()).map((category) => [category.id, category]),
      );
      await audit.record({
        actor: req.session.username,
        action: 'PRODUCT_CREATED',
        targetType: 'product',
        targetId: product.id,
        newState: {
          isPublished: product.is_published === 1,
          isAvailable: product.is_available === 1,
          priceCentavos: product.price_centavos,
        },
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      eventBus.publish({
        type: EVENT_TYPES.CATALOG_CHANGED,
        data: { productId: product.id, action: 'created', version: product.version },
      });
      res.status(201).json({ product: serializeProduct(product, categoryById) });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/products/:id/publication', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(publicationPatchSchema, req.body);
      const product = await catalog.findProductById(req.params.id);
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      if (product.version !== input.version) {
        return res.status(409).json({
          error: { code: 'STALE_VERSION', message: 'Product state was modified by another action' },
          product: {
            id: product.id,
            isAvailable: product.is_available === 1,
            isPublished: product.is_published === 1,
            version: product.version,
            updatedAt: product.updated_at,
          },
          requestId: req.id,
        });
      }
      const updated = await catalog.updatePublication(req.params.id, input, input.version);
      if (!updated) throw conflict('STALE_VERSION', 'Product state was modified by another action');
      await audit.record({
        actor: req.session.username,
        action: 'PRODUCT_PUBLICATION_CHANGED',
        targetType: 'product',
        targetId: updated.id,
        previousState: {
          isPublished: product.is_published === 1,
          isAvailable: product.is_available === 1,
          version: product.version,
        },
        newState: {
          isPublished: updated.is_published === 1,
          isAvailable: updated.is_available === 1,
          version: updated.version,
        },
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      const categoryById = new Map(
        (await catalog.listCategories()).map((category) => [category.id, category]),
      );
      eventBus.publish({
        type: EVENT_TYPES.CATALOG_CHANGED,
        data: { productId: updated.id, action: 'publication_changed', version: updated.version },
      });
      res.json({ product: serializeProduct(updated, categoryById) });
    } catch (err) {
      next(err);
    }
  });

  // --- Daily summary ---------------------------------------------------------
  router.get('/summary', requireAuth, async (req, res, next) => {
    try {
      const summary = await buildDailySummary(db, undefined, orders);
      res.json({
        summary,
        connection: {
          status: 'ok',
          serverTime: new Date().toISOString(),
          db: 'ok',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/analytics', requireAuth, async (req, res, next) => {
    try {
      const range = parseOrThrow(reportQuerySchema, req.query);
      const [reportOrders, reportItems] = await Promise.all([
        orders.listForReport(range),
        orders.itemsForReport(range),
      ]);
      const analytics = buildDashboardAnalytics({
        orders: reportOrders,
        items: reportItems,
        ...range,
      });
      res.json({
        analytics,
        connection: {
          status: 'ok',
          serverTime: new Date().toISOString(),
          db: 'ok',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // --- Audit and statement of account --------------------------------------
  router.get('/audit-events', requireAuth, async (req, res, next) => {
    try {
      const query = parseOrThrow(auditLogQuerySchema, req.query);
      const events = (await audit.list(query)).map((event) => ({
        id: event.id,
        actor: event.actor,
        actorRole: event.actor_role,
        action: event.action,
        targetType: event.target_type,
        targetId: event.target_id,
        previousState: parseJson(event.previous_state),
        newState: parseJson(event.new_state),
        createdAt: event.created_at,
      }));
      res.json({ events });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/summary', requireAuth, async (req, res, next) => {
    try {
      const range = parseOrThrow(reportQuerySchema, req.query);
      res.json({ summary: buildSoaSummary(await orders.listForReport(range), range) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/soa.xlsx', requireAuth, async (req, res, next) => {
    try {
      const range = parseOrThrow(reportQuerySchema, req.query);
      const reportOrders = await orders.listForReport(range);
      const reportItems = await orders.itemsForReport(range);
      const summary = buildSoaSummary(reportOrders, range);
      const analytics = buildDashboardAnalytics({
        orders: reportOrders,
        items: reportItems,
        ...range,
      });
      const [auditEvents, catalogProducts] = await Promise.all([
        audit.list({ from: range.from, to: range.to, limit: 500 }),
        catalog.listProducts({ publishedOnly: false }),
      ]);
      const workbook = await createOperationsWorkbook({
        summary,
        analytics,
        orders: reportOrders,
        items: reportItems,
        auditEvents,
        catalog: catalogProducts,
        generatedBy: req.session.username,
      });
      await audit.record({
        actor: req.session.username,
        action: 'SOA_EXPORTED',
        targetType: 'report',
        targetId: `${range.from}:${range.to}`,
        newState: summary,
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      const filename = `sweet-gonz-operations-${range.from}-to-${range.to}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(workbook));
    } catch (err) {
      next(err);
    }
  });

  // --- Server-sent events ----------------------------------------------------
  router.get('/events', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (record) => {
      res.write(`id: ${record.seq}\n`);
      res.write(`event: ${record.type}\n`);
      res.write(`data: ${JSON.stringify(record.data)}\n\n`);
    };

    for (const record of eventBus.recent()) send(record);

    const unsubscribe = eventBus.subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return router;
}
