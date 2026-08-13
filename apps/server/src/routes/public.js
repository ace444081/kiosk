import { Router } from 'express';
import { createOrderSchema, localeSchema } from '@kiosk/shared';
import { CatalogRepository } from '../repositories/catalog.js';
import { zodErrorToEnvelope } from '../middleware/errors.js';
import { badRequest } from '../utils/app-error.js';
import { DateTime } from 'luxon';
import { BUSINESS_TIMEZONE } from '@kiosk/shared';
import { OrderRepository } from '../repositories/orders.js';

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function publicRoutes({
  db,
  orderService,
  eventBus,
  catalog: catalogOverride,
  orders: ordersOverride,
}) {
  const router = Router();
  const catalog = catalogOverride || new CatalogRepository(db);
  const orders = ordersOverride || new OrderRepository(db);

  router.get('/orders/board', async (req, res, next) => {
    try {
      const businessDate = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat('yyyy-MM-dd');
      const board = (await orders.listPublicBoard(businessDate)).map((order) => ({
        orderNumber: order.order_number,
        publicStatus: ['ready', 'completed'].includes(order.status) ? 'now_serving' : 'preparing',
        displayTimestamp:
          order.completed_at || order.ready_at || order.preparing_at || order.created_at,
      }));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ businessDate, orders: board, serverTime: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  });

  router.get('/orders/board/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (record) => {
      res.write(`id: ${record.seq}\n`);
      res.write('event: refresh\n');
      res.write('data: {"refresh":true}\n\n');
    };
    const unsubscribe = eventBus.subscribe(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  /**
   * GET /api/v1/menu?locale=en|fil
   * Localized menu with categories, products, add-ons and option groups.
   * Cacheable: the PWA stores the latest successful response for offline use.
   */
  router.get('/menu', async (req, res, next) => {
    try {
      const parsed = localeSchema.safeParse(req.query.locale || 'en');
      const locale = parsed.success ? parsed.data : 'en';
      const isFil = locale === 'fil';

      const menuData = catalog.getPublishedMenuData
        ? await catalog.getPublishedMenuData()
        : {
            categories: await catalog.listCategories(),
            products: await catalog.listProducts({ publishedOnly: true }),
            addons: await catalog.listAddons(),
            productAddonRows: [],
            optionGroups: [],
            options: [],
          };
      const { categories, products, addons, productAddonRows, optionGroups, options } = menuData;
      const addonById = new Map(addons.map((a) => [a.id, a]));
      const addonIdsByProduct = new Map();
      for (const relation of productAddonRows) {
        const list = addonIdsByProduct.get(relation.product_id) || [];
        list.push(relation.addon_id);
        addonIdsByProduct.set(relation.product_id, list);
      }
      const optionGroupsByProduct = new Map();
      for (const group of optionGroups) {
        const list = optionGroupsByProduct.get(group.product_id) || [];
        list.push(group);
        optionGroupsByProduct.set(group.product_id, list);
      }
      const optionsByGroup = new Map();
      for (const option of options) {
        const list = optionsByGroup.get(option.group_id) || [];
        list.push(option);
        optionsByGroup.set(option.group_id, list);
      }

      const productsByCategory = new Map();
      for (const p of products) {
        const group = productsByCategory.get(p.category_id) || [];
        group.push(p);
        productsByCategory.set(p.category_id, group);
      }

      const result = {
        locale,
        generatedAt: new Date().toISOString(),
        categories: categories.map((category) => {
          const categoryProducts = (productsByCategory.get(category.id) || []).map((p) => {
            const groups = optionGroupsByProduct.get(p.id) || [];
            return {
              id: p.id,
              sku: p.sku,
              name: p.name,
              description: isFil ? p.description_fil : p.description_en,
              priceCentavos: p.price_centavos,
              imagePath: p.image_path,
              isAvailable: p.is_available === 1,
              version: p.version,
              addons: (addonIdsByProduct.get(p.id) || [])
                .map((addonId) => {
                  const addon = addonById.get(addonId);
                  if (!addon) return null;
                  return {
                    id: addon.id,
                    name: isFil ? addon.name_fil : addon.name_en,
                    priceCentavos: addon.price_centavos,
                  };
                })
                .filter(Boolean),
              optionGroups: groups.map((g) => ({
                id: g.id,
                name: isFil ? g.name_fil : g.name_en,
                isRequired: g.is_required === 1 || g.is_required === true,
                minSelect: g.min_select,
                maxSelect: g.max_select,
                options: (optionsByGroup.get(g.id) || []).map((o) => ({
                  id: o.id,
                  name: isFil ? o.name_fil : o.name_en,
                  priceCentavos: o.price_centavos,
                })),
              })),
            };
          });
          return {
            id: category.id,
            name: isFil ? category.name_fil : category.name_en,
            sortOrder: category.sort_order,
            products: categoryProducts,
          };
        }),
      };
      res.setHeader('Cache-Control', 'public, max-age=5');
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/v1/orders
   * Requires an Idempotency-Key header. Client prices are ignored; the server
   * loads current catalog data, validates, prices, snapshots, and commits
   * atomically.
   */
  router.post('/orders', async (req, res, next) => {
    try {
      const idempotencyKey = req.get('Idempotency-Key');
      if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
        throw badRequest('IDEMPOTENCY_KEY_MISSING', 'A valid Idempotency-Key header is required');
      }

      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        const envelope = zodErrorToEnvelope(parsed.error);
        throw badRequest(envelope.code, envelope.message, envelope.fieldErrors);
      }

      const result = await orderService.createOrder({
        input: parsed.data,
        idempotencyKey,
        locale: parsed.data.locale,
        requestId: req.id,
        ip: req.ip,
      });

      if (result.duplicate) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({
          ...result.order,
          duplicate: true,
          receiptToken: null,
        });
      }

      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({
        ...result.order,
        duplicate: false,
        receiptToken: result.receiptToken,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/v1/orders/:orderNumber/receipt?token=...
   * Private receipt: requires the opaque token issued at creation. Only its
   * hash is stored, so wrong tokens are indistinguishable from missing
   * receipts (404).
   */
  router.get('/orders/:orderNumber/receipt', async (req, res, next) => {
    try {
      const receipt = await orderService.getReceipt(req.params.orderNumber, req.query.token);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ receipt });
    } catch (err) {
      next(err);
    }
  });

  /** GET /api/v1/health */
  router.get('/health', async (req, res) => {
    let dbOk = true;
    let dbError = null;
    try {
      if (typeof db.health === 'function') await db.health();
      else db.prepare('SELECT 1').get();
    } catch (err) {
      dbOk = false;
      dbError = err.message;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: dbOk ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      db: dbOk ? 'ok' : 'error',
      dbError,
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  return router;
}
