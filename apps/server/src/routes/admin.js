import express, { Router } from 'express';
import sharp from 'sharp';
import {
  adminLoginSchema,
  createAccountSchema,
  availabilityPatchSchema,
  catalogPatchSchema,
  auditLogQuerySchema,
  createProductSchema,
  updateProductSchema,
  listOrdersQuerySchema,
  listProductsQuerySchema,
  paymentPatchSchema,
  publicationPatchSchema,
  reportQuerySchema,
  resetAccountPasswordSchema,
  statusPatchSchema,
  updateAccountSchema,
  BEVERAGE_CATEGORIES,
  MAX_PRODUCT_IMAGE_BYTES,
  MAX_PRODUCT_IMAGE_UPLOAD_BYTES,
  SUGAR_LEVEL_GROUP,
  getStockStatus,
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
import { buildDashboardAnalytics, buildStaffPerformance } from '../services/dashboard-analytics.js';
import { createOperationsWorkbook } from '../services/operations-workbook.js';
import { CatalogRepository } from '../repositories/catalog.js';
import { OrderRepository } from '../repositories/orders.js';
import { AdminRepository } from '../repositories/admins.js';
import { AuditRepository } from '../repositories/audit.js';
import { EVENT_TYPES } from '../events/event-types.js';
import { buildSoaSummary } from '../services/soa-report.js';
import { randomId } from '../security/tokens.js';
import { AdminAuthService } from '../services/admin-auth.js';

function parseOrThrow(schema, data) {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const envelope = zodErrorToEnvelope(parsed.error);
    throw badRequest(envelope.code, envelope.message, envelope.fieldErrors);
  }
  return parsed.data;
}

function serializeAccount(account) {
  return {
    id: account.id,
    username: account.username,
    fullName: account.full_name || account.username,
    employeeId: account.employee_id || null,
    email: account.email || null,
    role: account.role,
    isActive: account.is_active === 1 || account.is_active === true,
    mustChangePassword: account.must_change_password === 1 || account.must_change_password === true,
    lastLoginAt: account.last_login_at || null,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
    version: account.version || 1,
  };
}

function imageMimeFromMagic(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).equals(buffer.subarray(0, 8))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function serializeProduct(product, categoryById) {
  const isEnabled = product.is_available === 1;
  const hasStock = product.stock_quantity == null || product.stock_quantity > 0;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    categoryId: product.category_id,
    categoryName: categoryById.get(product.category_id)?.name_en || product.category_id,
    descriptionEn: product.description_en,
    descriptionFil: product.description_fil,
    priceCentavos: product.price_centavos,
    imagePath: product.image_path,
    sortOrder: product.sort_order,
    isAvailable: isEnabled && hasStock,
    isEnabled,
    isPublished: product.is_published === 1,
    stockQuantity: product.stock_quantity,
    stockStatus: getStockStatus(product.stock_quantity),
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

function defaultSugarOptionGroup() {
  return {
    key: SUGAR_LEVEL_GROUP.sku,
    nameEn: SUGAR_LEVEL_GROUP.nameEn,
    nameFil: SUGAR_LEVEL_GROUP.nameFil,
    isRequired: SUGAR_LEVEL_GROUP.isRequired,
    minSelect: SUGAR_LEVEL_GROUP.minSelect,
    maxSelect: SUGAR_LEVEL_GROUP.maxSelect,
    options: SUGAR_LEVEL_GROUP.options.map((option) => ({
      nameEn: option.nameEn,
      nameFil: option.nameFil,
      priceCentavos: option.priceCentavos,
    })),
  };
}

function optionGroupKey(group, productId) {
  for (const separator of ['--', '__']) {
    const prefix = `${productId}${separator}`;
    if (String(group.id || '').startsWith(prefix)) return group.id.slice(prefix.length);
  }
  return String(group.id || 'choice');
}

function serializeProductEditor(product, addonIds, groups, options) {
  const optionsByGroup = new Map();
  for (const option of options) {
    const list = optionsByGroup.get(option.group_id) || [];
    list.push(option);
    optionsByGroup.set(option.group_id, list);
  }
  return {
    addonIds,
    optionGroups: groups.map((group) => ({
      key: optionGroupKey(group, product.id),
      nameEn: group.name_en,
      nameFil: group.name_fil,
      isRequired: group.is_required === 1 || group.is_required === true,
      minSelect: group.min_select,
      maxSelect: group.max_select,
      options: (optionsByGroup.get(group.id) || []).map((option) => ({
        nameEn: option.name_en,
        nameFil: option.name_fil,
        priceCentavos: option.price_centavos,
      })),
    })),
  };
}

/**
 * Cashier reports are scoped to the staff member who confirmed payment. A
 * demo-wallet order has no cashier attribution and therefore is not included
 * in a dedicated cashier view. Keep the item rows aligned with the scoped
 * order rows so exports and product totals cannot leak unrelated activity.
 */
function scopeReportRows(orders, items, staffFilter) {
  if (!staffFilter || staffFilter === 'all') return { orders, items };
  const scopedOrders = orders.filter((order) => order.payment_confirmed_by === staffFilter);
  const orderNumbers = new Set(scopedOrders.map((order) => order.order_number));
  return {
    orders: scopedOrders,
    items: items.filter((item) => orderNumbers.has(item.order_number)),
  };
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
  const accountDirectory = adminsOverride || new AdminRepository(db);
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
      const account = await accountDirectory.findById(req.session.adminId);
      const isActive = account?.is_active === 1 || account?.is_active === true;
      if (!account || !isActive) {
        return res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          requestId: req.id,
        });
      }
      res.json({
        authenticated: true,
        username: account.username,
        role: account.role,
        fullName: account.full_name || account.username,
        mustChangePassword:
          account.must_change_password === 1 || account.must_change_password === true,
        version: account.version || 1,
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
  router.use(requireAuth, resolveStaff(accountDirectory), requireRoles('admin'));

  // --- Account directory ---------------------------------------------------
  // Account mutations stay behind the admin-only middleware above. Responses
  // are deliberately sanitized so password hashes never leave the server.
  router.get('/accounts', async (req, res, next) => {
    try {
      const accounts = await accountDirectory.listAll();
      res.json({ accounts: accounts.map(serializeAccount) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/accounts', requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(createAccountSchema, req.body);
      const existing = await accountDirectory.listAll();
      const normalizedUsername = input.username.toLowerCase();
      if (existing.some((account) => account.username.toLowerCase() === normalizedUsername)) {
        throw conflict('ACCOUNT_USERNAME_EXISTS', 'That username is already in use');
      }
      if (
        input.email &&
        existing.some(
          (account) => account.email && account.email.toLowerCase() === input.email.toLowerCase(),
        )
      ) {
        throw conflict('ACCOUNT_EMAIL_EXISTS', 'That email is already in use');
      }

      const account = await accountDirectory.create({
        id: randomId(),
        username: input.username,
        passwordHash: AdminAuthService.hashPassword(input.password),
        role: input.role,
        fullName: input.fullName,
        employeeId: `EMP-${randomId().slice(0, 8).toUpperCase()}`,
        email: input.email || null,
        mustChangePassword: true,
      });
      const safeAccount = serializeAccount(account);
      await audit.record({
        actor: req.session.username,
        actorRole: req.staff.role,
        action: 'ACCOUNT_CREATED',
        targetType: 'account',
        targetId: safeAccount.id,
        newState: safeAccount,
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.status(201).json({ account: safeAccount });
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.code === '23505') {
        return next(conflict('ACCOUNT_EXISTS', 'An account with those details already exists'));
      }
      next(err);
    }
  });

  router.patch('/accounts/:id', requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(updateAccountSchema, req.body);
      const current = await accountDirectory.findById(req.params.id);
      if (!current) throw notFound('ACCOUNT_NOT_FOUND', 'Account not found');

      const nextRole = input.role ?? current.role;
      const nextActive = input.isActive ?? (current.is_active === 1 || current.is_active === true);
      if (current.id === req.session.adminId && (nextRole !== 'admin' || !nextActive)) {
        throw badRequest('SELF_LOCKOUT', 'You cannot deactivate or demote your own account');
      }

      const currentIsActiveAdmin =
        current.role === 'admin' && (current.is_active === 1 || current.is_active === true);
      const becomesInactiveAdmin = nextRole !== 'admin' || !nextActive;
      if (
        currentIsActiveAdmin &&
        becomesInactiveAdmin &&
        (await accountDirectory.countActiveAdmins()) <= 1
      ) {
        throw badRequest('LAST_ADMIN', 'Keep at least one active administrator account');
      }

      const updated = await accountDirectory.updateProfile(
        req.params.id,
        {
          fullName: input.fullName,
          role: input.role,
          email: input.email,
          isActive: input.isActive,
        },
        input.version,
      );
      if (!updated) throw conflict('STALE_VERSION', 'Account was changed by another action');
      const safeAccount = serializeAccount(updated);
      await audit.record({
        actor: req.session.username,
        actorRole: req.staff.role,
        action: 'ACCOUNT_UPDATED',
        targetType: 'account',
        targetId: safeAccount.id,
        previousState: serializeAccount(current),
        newState: safeAccount,
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.json({ account: safeAccount });
    } catch (err) {
      if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE' || err?.code === '23505') {
        return next(conflict('ACCOUNT_EMAIL_EXISTS', 'That email is already in use'));
      }
      next(err);
    }
  });

  router.post('/accounts/:id/password', requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(resetAccountPasswordSchema, req.body);
      const current = await accountDirectory.findById(req.params.id);
      if (!current) throw notFound('ACCOUNT_NOT_FOUND', 'Account not found');
      const updated = await accountDirectory.resetPassword(
        req.params.id,
        AdminAuthService.hashPassword(input.password),
        input.version,
      );
      if (!updated) throw conflict('STALE_VERSION', 'Account was changed by another action');
      const safeAccount = serializeAccount(updated);
      await audit.record({
        actor: req.session.username,
        actorRole: req.staff.role,
        action: 'ACCOUNT_PASSWORD_RESET',
        targetType: 'account',
        targetId: safeAccount.id,
        newState: { version: safeAccount.version, mustChangePassword: true },
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      res.json({ account: safeAccount });
    } catch (err) {
      next(err);
    }
  });

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
        paymentConfirmedBy: row.payment_confirmed_by || null,
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

  router.get('/products/:id', requireAuth, async (req, res, next) => {
    try {
      const product = await catalog.findProductById(req.params.id);
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      const [categories, addonIds, groups] = await Promise.all([
        catalog.listCategories(),
        catalog.addonIdsForProduct(product.id),
        catalog.optionGroupsForProduct(product.id),
      ]);
      const options = await catalog.optionsForGroups(groups.map((group) => group.id));
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      res.json({
        product: serializeProduct(product, categoryById),
        ...serializeProductEditor(product, addonIds, groups, options),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/products/:id/image',
    express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'],
      limit: MAX_PRODUCT_IMAGE_UPLOAD_BYTES,
    }),
    requireCsrf,
    async (req, res, next) => {
      try {
        const product = await catalog.findProductById(req.params.id);
        if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
        const expectedVersion = Number.parseInt(req.get('X-Product-Version') || '', 10);
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
          throw badRequest('IMAGE_VERSION_REQUIRED', 'The current product version is required');
        }
        if (product.version !== expectedVersion) {
          const categoryById = new Map(
            (await catalog.listCategories()).map((category) => [category.id, category]),
          );
          return res.status(409).json({
            error: { code: 'STALE_VERSION', message: 'Product was modified by another action' },
            product: serializeProduct(product, categoryById),
            requestId: req.id,
          });
        }

        const input = Buffer.isBuffer(req.body) ? req.body : null;
        const detectedMime = input && imageMimeFromMagic(input);
        if (!input?.length || !detectedMime) {
          throw badRequest('INVALID_PRODUCT_IMAGE', 'Upload a valid JPEG, PNG, or WebP image');
        }

        let imageData;
        let metadata;
        try {
          const image = sharp(input, { failOn: 'error' });
          metadata = await image.metadata();
          imageData = await image
            .rotate()
            .resize({ width: 1280, height: 960, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82, effort: 4 })
            .toBuffer();
        } catch {
          throw badRequest('INVALID_PRODUCT_IMAGE', 'Upload a valid JPEG, PNG, or WebP image');
        }
        if (!imageData.length || imageData.length > MAX_PRODUCT_IMAGE_BYTES) {
          throw badRequest('PRODUCT_IMAGE_TOO_LARGE', 'The processed image is still too large');
        }

        const updated = await catalog.updateProductImage(
          product.id,
          {
            mimeType: 'image/webp',
            imageData,
            byteSize: imageData.length,
            width: metadata.width || null,
            height: metadata.height || null,
          },
          expectedVersion,
        );
        if (!updated) throw conflict('STALE_VERSION', 'Product was modified by another action');

        await audit.record({
          actor: req.session.username,
          action: 'PRODUCT_IMAGE_UPDATED',
          targetType: 'product',
          targetId: updated.id,
          previousState: {
            imagePath: product.image_path,
            version: product.version,
          },
          newState: {
            imagePath: updated.image_path,
            mimeType: 'image/webp',
            sourceMimeType: detectedMime,
            byteSize: imageData.length,
            width: metadata.width || null,
            height: metadata.height || null,
            version: updated.version,
          },
          requestId: req.id,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
        });
        eventBus.publish({
          type: EVENT_TYPES.CATALOG_CHANGED,
          data: { productId: updated.id, action: 'image_updated', version: updated.version },
        });
        const categoryById = new Map(
          (await catalog.listCategories()).map((category) => [category.id, category]),
        );
        res.json({
          product: serializeProduct(updated, categoryById),
          image: {
            mimeType: 'image/webp',
            byteSize: imageData.length,
            width: metadata.width || null,
            height: metadata.height || null,
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch('/products/:id', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(updateProductSchema, req.body);
      const product = await catalog.findProductById(req.params.id);
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      if (product.version !== input.version) {
        const categoryById = new Map(
          (await catalog.listCategories()).map((category) => [category.id, category]),
        );
        return res.status(409).json({
          error: { code: 'STALE_VERSION', message: 'Product was modified by another action' },
          product: serializeProduct(product, categoryById),
          requestId: req.id,
        });
      }

      const categories = await catalog.listCategories();
      if (!categories.some((category) => category.id === input.categoryId)) {
        throw badRequest('CATEGORY_NOT_FOUND', 'Choose an existing category');
      }
      const addonIds = new Set((await catalog.listAddons()).map((addon) => addon.id));
      const unknownAddon = input.addonIds.find((addonId) => !addonIds.has(addonId));
      if (unknownAddon) throw badRequest('ADDON_NOT_FOUND', 'Choose existing add-ons only');

      const optionGroups = [...input.optionGroups];
      if (
        BEVERAGE_CATEGORIES.has(input.categoryId) &&
        !optionGroups.some((group) => group.key === SUGAR_LEVEL_GROUP.sku)
      ) {
        optionGroups.push(defaultSugarOptionGroup());
      }
      const updated = await catalog.updateProduct(
        req.params.id,
        { ...input, optionGroups },
        input.version,
      );
      if (!updated) throw conflict('STALE_VERSION', 'Product was modified by another action');

      await audit.record({
        actor: req.session.username,
        action: 'PRODUCT_UPDATED',
        targetType: 'product',
        targetId: updated.id,
        previousState: {
          categoryId: product.category_id,
          name: product.name,
          descriptionEn: product.description_en,
          descriptionFil: product.description_fil,
          priceCentavos: product.price_centavos,
          imagePath: product.image_path,
          isAvailable: product.is_available === 1,
          isPublished: product.is_published === 1,
          stockQuantity: product.stock_quantity,
          sortOrder: product.sort_order,
          version: product.version,
        },
        newState: {
          categoryId: updated.category_id,
          name: updated.name,
          descriptionEn: updated.description_en,
          descriptionFil: updated.description_fil,
          priceCentavos: updated.price_centavos,
          imagePath: updated.image_path,
          isAvailable: updated.is_available === 1,
          isPublished: updated.is_published === 1,
          stockQuantity: updated.stock_quantity,
          sortOrder: updated.sort_order,
          version: updated.version,
        },
        requestId: req.id,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
      const categoryById = new Map(categories.map((category) => [category.id, category]));
      eventBus.publish({
        type: EVENT_TYPES.CATALOG_CHANGED,
        data: { productId: updated.id, action: 'updated', version: updated.version },
      });
      res.json({ product: serializeProduct(updated, categoryById) });
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
      const categoryById = new Map(
        (await catalog.listCategories()).map((category) => [category.id, category]),
      );
      res.json({ product: serializeProduct(updated, categoryById) });
      eventBus.publish({
        type: EVENT_TYPES.AVAILABILITY_CHANGED,
        data: {
          productId: updated.id,
          isAvailable:
            updated.is_available === 1 &&
            (updated.stock_quantity == null || updated.stock_quantity > 0),
          version: updated.version,
          updatedAt: updated.updated_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/products/:id/catalog', requireAuth, requireCsrf, async (req, res, next) => {
    try {
      const input = parseOrThrow(catalogPatchSchema, req.body);
      const product = await catalog.findProductById(req.params.id);
      if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Product not found');
      if (product.version !== input.version) {
        const categoryById = new Map(
          (await catalog.listCategories()).map((category) => [category.id, category]),
        );
        return res.status(409).json({
          error: { code: 'STALE_VERSION', message: 'Product was modified by another action' },
          product: serializeProduct(product, categoryById),
          requestId: req.id,
        });
      }
      const updated = await catalog.updateCatalog(req.params.id, input, input.version);
      if (!updated) throw conflict('STALE_VERSION', 'Product was modified by another action');
      await audit.record({
        actor: req.session.username,
        action: 'PRODUCT_CATALOG_CHANGED',
        targetType: 'product',
        targetId: updated.id,
        previousState: {
          imagePath: product.image_path,
          stockQuantity: product.stock_quantity,
          version: product.version,
        },
        newState: {
          imagePath: updated.image_path,
          stockQuantity: updated.stock_quantity,
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
        data: { productId: updated.id, action: 'catalog_changed', version: updated.version },
      });
      res.json({ product: serializeProduct(updated, categoryById) });
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
      const categories = await catalog.listCategories();
      const category = categories.find((candidate) => candidate.id === input.categoryId);
      if (!category) {
        throw badRequest('CATEGORY_NOT_FOUND', 'Choose an existing category');
      }
      const addonIds = new Set((await catalog.listAddons()).map((addon) => addon.id));
      const unknownAddon = input.addonIds.find((addonId) => !addonIds.has(addonId));
      if (unknownAddon) throw badRequest('ADDON_NOT_FOUND', 'Choose existing add-ons only');

      const optionGroups = [...input.optionGroups];
      if (
        BEVERAGE_CATEGORIES.has(category.id) &&
        !optionGroups.some((group) => group.key === SUGAR_LEVEL_GROUP.sku)
      ) {
        optionGroups.push(defaultSugarOptionGroup());
      }
      const product = await catalog.createProduct({ ...input, optionGroups });
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
          stockQuantity: product.stock_quantity,
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
      const [todayOrders, staffAccounts] = await Promise.all([
        orders.list({ date: summary.businessDate }),
        accountDirectory.listStaff(),
      ]);
      res.json({
        summary,
        staffPerformance: buildStaffPerformance({ orders: todayOrders, staffAccounts }),
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
      const [reportOrders, reportItems, staffAccounts] = await Promise.all([
        orders.listForReport(range),
        orders.itemsForReport(range),
        accountDirectory.listStaff(),
      ]);
      const selectedStaff = range.staff && range.staff !== 'all' ? range.staff : null;
      const scoped = scopeReportRows(reportOrders, reportItems, selectedStaff);
      const analytics = buildDashboardAnalytics({
        orders: scoped.orders,
        items: scoped.items,
        staffAccounts: selectedStaff
          ? staffAccounts.filter((staff) => staff.username === selectedStaff)
          : staffAccounts,
        ...range,
      });
      res.json({
        analytics: {
          ...analytics,
          // Keep the selector future-proof even when a scoped view only
          // returns the selected cashier's performance row.
          availableStaff: staffAccounts.map((staff) => ({
            username: staff.username,
            active: staff.is_active === 1 || staff.is_active === true,
          })),
        },
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
      const reportOrders = await orders.listForReport(range);
      const selectedStaff = range.staff && range.staff !== 'all' ? range.staff : null;
      const scoped = scopeReportRows(reportOrders, [], selectedStaff);
      res.json({ summary: buildSoaSummary(scoped.orders, range) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/reports/soa.xlsx', requireAuth, async (req, res, next) => {
    try {
      const range = parseOrThrow(reportQuerySchema, req.query);
      const [reportOrders, reportItems, staffAccounts] = await Promise.all([
        orders.listForReport(range),
        orders.itemsForReport(range),
        accountDirectory.listStaff(),
      ]);
      const selectedStaff = range.staff && range.staff !== 'all' ? range.staff : null;
      const scoped = scopeReportRows(reportOrders, reportItems, selectedStaff);
      const summary = buildSoaSummary(scoped.orders, range);
      const analytics = buildDashboardAnalytics({
        orders: scoped.orders,
        items: scoped.items,
        staffAccounts: selectedStaff
          ? staffAccounts.filter((staff) => staff.username === selectedStaff)
          : staffAccounts,
        ...range,
      });
      const [auditEvents, catalogProducts] = await Promise.all([
        audit.list({ from: range.from, to: range.to, limit: 500 }),
        catalog.listProducts({ publishedOnly: false }),
      ]);
      const scopedAuditEvents = selectedStaff
        ? auditEvents.filter((event) => event.actor === selectedStaff)
        : auditEvents;
      const workbook = await createOperationsWorkbook({
        summary,
        analytics,
        orders: scoped.orders,
        items: scoped.items,
        auditEvents: scopedAuditEvents,
        catalog: catalogProducts,
        generatedBy: req.session.username,
        staffFilter: selectedStaff || 'all',
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
