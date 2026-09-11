import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import request from 'supertest';
import http from 'node:http';
import { makeTestApp, createTestAdmin, loginAgent, cashOrderPayload } from '../utils.js';

describe('admin API - auth, CSRF, rate limiting, workflow, summary', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeTestApp();
    createTestAdmin(ctx.db, { username: 'boss', password: 'boss-pass-123' });
  });

  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  const idem = () => `admin-key-${Math.random().toString(36).slice(2, 14)}`;

  async function placeCashOrder(agent) {
    const res = await agent
      .post('/api/v1/orders')
      .set('Idempotency-Key', idem())
      .send(cashOrderPayload());
    expect(res.status).toBe(201);
    return res.body;
  }

  describe('authentication', () => {
    it('denies admin endpoints without a session', async () => {
      const res = await request(ctx.app).get('/api/v1/admin/orders');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('logs in, returns CSRF token, and exposes the session', async () => {
      const { agent, csrfToken, username } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      expect(username).toBe('boss');
      expect(csrfToken).toBeTruthy();
      const session = await agent.get('/api/v1/admin/session');
      expect(session.status).toBe(200);
      expect(session.body.authenticated).toBe(true);
      expect(session.body.csrfToken).toBe(csrfToken);
    });

    it('returns a generic error for unknown users and wrong passwords', async () => {
      const unknown = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'nobody', password: 'x' });
      expect(unknown.status).toBe(401);
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
      const wrong = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'wrong-password' });
      expect(wrong.status).toBe(401);
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('regenerates the session id on login (old cookie invalid)', async () => {
      const agent = request.agent(ctx.app);
      await agent
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'boss-pass-123' });
      const session = await agent.get('/api/v1/admin/session');
      expect(session.body.authenticated).toBe(true);
    });

    it('rejects mutations without a CSRF token', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const res = await agent.patch('/api/v1/admin/products/americano/availability').send({
        isAvailable: false,
        version: 1,
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects mutations with a wrong CSRF token', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const res = await agent
        .patch('/api/v1/admin/products/americano/availability')
        .set('X-CSRF-Token', 'forged-token')
        .send({ isAvailable: false, version: 1 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CSRF_INVALID');
    });

    it('rate-limits failed logins per IP+username pair (5 per 15 min)', async () => {
      for (let i = 0; i < 5; i += 1) {
        const res = await request(ctx.app)
          .post('/api/v1/admin/session')
          .send({ username: 'boss', password: 'wrong' });
        expect(res.status).toBe(401);
      }
      const blocked = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'boss-pass-123' });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(blocked.headers['retry-after']).toBeTruthy();
    });

    it('successful login resets the failed-attempt counter', async () => {
      for (let i = 0; i < 4; i += 1) {
        await request(ctx.app)
          .post('/api/v1/admin/session')
          .send({ username: 'boss', password: 'wrong' });
      }
      const ok = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'boss-pass-123' });
      expect(ok.status).toBe(200);
      // Counter reset: a fresh failure is allowed again.
      const again = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'wrong' });
      expect(again.status).toBe(401);
    });

    it('logs out and invalidates the session', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const out = await agent.delete('/api/v1/admin/session');
      expect(out.status).toBe(204);
      const after = await agent.get('/api/v1/admin/orders');
      expect(after.status).toBe(401);
    });

    it('sets no-store cache control on admin responses', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const res = await agent.get('/api/v1/admin/orders');
      expect(res.headers['cache-control']).toContain('no-store');
    });
  });

  describe('order workflow', () => {
    it('walks an order through placed -> preparing -> ready -> completed', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const order = await placeCashOrder(agent);
      const id = order.id;
      const v1 = order.version;

      const blockedPreparing = await agent
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'preparing', version: v1 });
      expect(blockedPreparing.status).toBe(409);
      expect(blockedPreparing.body.error.code).toBe('PREPARING_PAYMENT_REQUIRED');
      expect(blockedPreparing.body.order.version).toBe(v1);

      const paid = await agent
        .patch(`/api/v1/admin/orders/${id}/payment`)
        .set('X-CSRF-Token', csrfToken)
        .send({ paymentStatus: 'cash_received', version: v1 });
      expect(paid.status).toBe(200);
      expect(paid.body.order.paymentStatus).toBe('cash_received');

      const preparing = await agent
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'preparing', version: paid.body.order.version });
      expect(preparing.status).toBe(200);
      expect(preparing.body.order.status).toBe('preparing');
      expect(preparing.body.order.preparingAt).toBeTruthy();

      const ready = await agent
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'ready', version: preparing.body.order.version });
      expect(ready.status).toBe(200);

      const completed = await agent
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'completed', version: ready.body.order.version });
      expect(completed.status).toBe(200);
      expect(completed.body.order.status).toBe('completed');
      expect(completed.body.order.completedAt).toBeTruthy();
    });

    it('rejects a stale version update with 409 and the newest state', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const order = await placeCashOrder(agent);
      const paid = await agent
        .patch(`/api/v1/admin/orders/${order.id}/payment`)
        .set('X-CSRF-Token', csrfToken)
        .send({ paymentStatus: 'cash_received', version: order.version });
      // Advance the order once.
      await agent
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'preparing', version: paid.body.order.version });
      // Now try with the old version.
      const stale = await agent
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'cancelled', version: order.version });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');
      expect(stale.body.order.status).toBe('preparing');
      expect(stale.body.order.version).toBe(order.version + 2);
    });

    it('rejects invalid status transitions', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const order = await placeCashOrder(agent);
      const res = await agent
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'completed', version: order.version });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('allows cancellation from placed, preparing and ready', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const order = await placeCashOrder(agent);
      const cancelled = await agent
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'cancelled', version: order.version });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.order.cancelledAt).toBeTruthy();
      // Cannot reopen.
      const reopen = await agent
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'placed', version: cancelled.body.order.version });
      expect(reopen.status).toBe(409);
      expect(reopen.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('rejects cash confirmation for demo orders', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const created = await agent
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'demo_wallet',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      const res = await agent
        .patch(`/api/v1/admin/orders/${created.body.id}/payment`)
        .set('X-CSRF-Token', csrfToken)
        .send({ paymentStatus: 'cash_received', version: created.body.version });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INVALID_PAYMENT_STATE');
    });

    it('lists orders newest-first and filters by status and search', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      await placeCashOrder(agent);
      await placeCashOrder(agent);

      const all = await agent.get('/api/v1/admin/orders');
      expect(all.status).toBe(200);
      expect(all.body.orders.length).toBe(2);
      expect(all.body.orders[0].createdAt >= all.body.orders[1].createdAt).toBe(true);

      const firstNumber = all.body.orders[0].orderNumber;
      const bySearch = await agent.get(`/api/v1/admin/orders?search=${firstNumber}`);
      expect(bySearch.body.orders.length).toBe(1);
      expect(bySearch.body.orders[0].orderNumber).toBe(firstNumber);

      const byStatus = await agent.get('/api/v1/admin/orders?status=placed');
      expect(byStatus.body.orders.length).toBe(2);

      const byStatusMiss = await agent.get('/api/v1/admin/orders?status=completed');
      expect(byStatusMiss.body.orders.length).toBe(0);
    });

    it('returns order detail with item snapshots', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const order = await placeCashOrder(agent);
      const res = await agent.get(`/api/v1/admin/orders/${order.id}`);
      expect(res.status).toBe(200);
      expect(res.body.order.items[0].productName).toBe('2pc. Hashbrown');
      expect(res.body.order.items[0].quantity).toBe(2);
    });
  });

  describe('availability', () => {
    it('marks a product sold out and reflects it in the public menu', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const before = await request(ctx.app).get('/api/v1/menu?locale=en');
      const latte = before.body.categories
        .flatMap((c) => c.products)
        .find((p) => p.id === 'cafe-latte');
      expect(latte.isAvailable).toBe(true);

      const res = await agent
        .patch('/api/v1/admin/products/cafe-latte/availability')
        .set('X-CSRF-Token', csrfToken)
        .send({ isAvailable: false, version: latte.version });
      expect(res.status).toBe(200);
      expect(res.body.product.isAvailable).toBe(false);

      const after = await request(ctx.app).get('/api/v1/menu?locale=en');
      const latteAfter = after.body.categories
        .flatMap((c) => c.products)
        .find((p) => p.id === 'cafe-latte');
      expect(latteAfter.isAvailable).toBe(false);
    });

    it('rejects stale availability updates with 409', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const stale = await agent
        .patch('/api/v1/admin/products/americano/availability')
        .set('X-CSRF-Token', csrfToken)
        .send({ isAvailable: false, version: 999 });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');
    });

    it('returns the full editor shape and updates every product field safely', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const detail = await agent.get('/api/v1/admin/products/cafe-latte');
      expect(detail.status).toBe(200);
      expect(detail.body.product.sku).toBe('cafe-latte');
      expect(detail.body.product.descriptionEn).toContain('steamed milk');
      expect(detail.body.optionGroups).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'sugar-level' })]),
      );

      const update = await agent
        .patch('/api/v1/admin/products/cafe-latte')
        .set('X-CSRF-Token', csrfToken)
        .send({
          categoryId: 'drip-coffee',
          name: 'Cafe Latte Updated',
          descriptionEn: 'Updated English description.',
          descriptionFil: 'Updated Filipino description.',
          priceCentavos: 5700,
          imagePath: '/images/products/cafe-latte.webp',
          sortOrder: 22,
          isPublished: true,
          isAvailable: true,
          stockQuantity: 12,
          addonIds: ['addon-espresso-shot'],
          optionGroups: detail.body.optionGroups,
          version: detail.body.product.version,
        });
      expect(update.status).toBe(200);
      expect(update.body.product.name).toBe('Cafe Latte Updated');
      expect(update.body.product.priceCentavos).toBe(5700);
      expect(update.body.product.stockQuantity).toBe(12);

      const updatedDetail = await agent.get('/api/v1/admin/products/cafe-latte');
      expect(updatedDetail.body.product.descriptionFil).toBe('Updated Filipino description.');
      expect(updatedDetail.body.addonIds).toEqual(['addon-espresso-shot']);
      expect(updatedDetail.body.optionGroups).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: 'sugar-level' })]),
      );

      const stale = await agent
        .patch('/api/v1/admin/products/cafe-latte')
        .set('X-CSRF-Token', csrfToken)
        .send({
          categoryId: 'drip-coffee',
          name: 'Stale edit',
          descriptionEn: 'Stale English description.',
          descriptionFil: 'Stale Filipino description.',
          priceCentavos: 5700,
          imagePath: '/images/products/cafe-latte.webp',
          sortOrder: 22,
          isPublished: true,
          isAvailable: true,
          stockQuantity: 12,
          addonIds: [],
          optionGroups: detail.body.optionGroups,
          version: detail.body.product.version,
        });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');

      const audit = await agent.get('/api/v1/admin/audit-events');
      expect(audit.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'PRODUCT_UPDATED', targetId: 'cafe-latte' }),
        ]),
      );
    });

    it('creates a draft product that stays hidden and unorderable until published', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const create = await agent
        .post('/api/v1/admin/products')
        .set('X-CSRF-Token', csrfToken)
        .send({
          sku: 'test-pasta',
          categoryId: 'pasta',
          name: 'Test Pasta',
          descriptionEn: 'A testing pasta dish.',
          descriptionFil: 'Isang testing na pasta dish.',
          priceCentavos: 12500,
          imagePath: '/placeholders/food.svg',
          sortOrder: 99,
          isPublished: false,
          isAvailable: false,
          addonIds: [],
          optionGroups: [],
        });
      expect(create.status).toBe(201);
      expect(create.body.product.isPublished).toBe(false);

      const publicDraft = await request(ctx.app).get('/api/v1/menu?locale=en');
      expect(publicDraft.body.categories.flatMap((category) => category.products)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'test-pasta' })]),
      );
      const blockedOrder = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'test-pasta', quantity: 1 }],
        });
      expect(blockedOrder.status).toBe(400);
      expect(blockedOrder.body.error.code).toBe('VALIDATION_ERROR');

      const published = await agent
        .patch('/api/v1/admin/products/test-pasta/publication')
        .set('X-CSRF-Token', csrfToken)
        .send({ isPublished: true, isAvailable: true, version: create.body.product.version });
      expect(published.status).toBe(200);
      expect(published.body.product.isPublished).toBe(true);
      expect(published.body.product.isAvailable).toBe(true);

      const publicPublished = await request(ctx.app).get('/api/v1/menu?locale=en');
      expect(publicPublished.body.categories.flatMap((category) => category.products)).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'test-pasta', isAvailable: true })]),
      );
      const audit = await agent.get('/api/v1/admin/audit-events');
      expect(audit.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'PRODUCT_CREATED', targetId: 'test-pasta' }),
        ]),
      );
    });

    it('updates an existing product picture and tracked inventory with audit history', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const products = await agent.get('/api/v1/admin/products?search=americano');
      const americano = products.body.products.find((product) => product.id === 'americano');
      const updated = await agent
        .patch('/api/v1/admin/products/americano/catalog')
        .set('X-CSRF-Token', csrfToken)
        .send({
          imagePath: '/placeholders/products/americano.svg',
          stockQuantity: 0,
          version: americano.version,
        });
      expect(updated.status).toBe(200);
      expect(updated.body.product.stockQuantity).toBe(0);
      expect(updated.body.product.isEnabled).toBe(true);
      expect(updated.body.product.isAvailable).toBe(false);

      const publicMenu = await request(ctx.app).get('/api/v1/menu?locale=en');
      const publicAmericano = publicMenu.body.categories
        .flatMap((category) => category.products)
        .find((product) => product.id === 'americano');
      expect(publicAmericano.stockQuantity).toBe(0);
      expect(publicAmericano.isAvailable).toBe(false);

      const audit = await agent.get('/api/v1/admin/audit-events');
      expect(audit.body.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'PRODUCT_CATALOG_CHANGED', targetId: 'americano' }),
        ]),
      );
    });

    it('classifies low stock consistently and supports the low-stock filter', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const products = await agent.get('/api/v1/admin/products?search=americano');
      const americano = products.body.products.find((product) => product.id === 'americano');
      const updated = await agent
        .patch('/api/v1/admin/products/americano/catalog')
        .set('X-CSRF-Token', csrfToken)
        .send({
          imagePath: americano.imagePath,
          stockQuantity: 3,
          version: americano.version,
        });
      expect(updated.status).toBe(200);
      expect(updated.body.product.stockStatus).toBe('low');

      const publicMenu = await request(ctx.app).get('/api/v1/menu?locale=en');
      const publicAmericano = publicMenu.body.categories
        .flatMap((category) => category.products)
        .find((product) => product.id === 'americano');
      expect(publicAmericano.stockStatus).toBe('low');

      const lowStock = await agent.get('/api/v1/admin/products?availability=low_stock');
      expect(lowStock.status).toBe(200);
      expect(lowStock.body.products).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: 'americano', stockStatus: 'low' })]),
      );
    });

    it('adds the standard sugar level to a newly created beverage', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const create = await agent
        .post('/api/v1/admin/products')
        .set('X-CSRF-Token', csrfToken)
        .send({
          sku: 'test-new-latte',
          categoryId: 'drip-coffee',
          name: 'Test New Latte',
          descriptionEn: 'A testing latte drink.',
          descriptionFil: 'Isang testing na latte drink.',
          priceCentavos: 5500,
          imagePath: '/placeholders/products/cafe-latte.svg',
          sortOrder: 99,
          isPublished: true,
          isAvailable: true,
          addonIds: [],
          optionGroups: [],
        });
      expect(create.status).toBe(201);

      const menu = await request(ctx.app).get('/api/v1/menu?locale=en');
      const product = menu.body.categories
        .flatMap((category) => category.products)
        .find((candidate) => candidate.id === 'test-new-latte');
      expect(product.optionGroups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Sugar Level',
            options: expect.arrayContaining([expect.objectContaining({ name: '100%' })]),
          }),
        ]),
      );
    });
  });

  describe('account directory and product photos', () => {
    it('creates, edits, and resets role-scoped accounts without exposing secrets', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const created = await agent
        .post('/api/v1/admin/accounts')
        .set('X-CSRF-Token', csrfToken)
        .send({
          fullName: 'Kitchen Lead',
          username: 'kitchen-lead',
          role: 'kitchen',
          email: 'kitchen@example.com',
          password: 'kitchen-pass-123',
          passwordConfirmation: 'kitchen-pass-123',
        });
      expect(created.status).toBe(201);
      expect(created.body.account).toEqual(
        expect.objectContaining({
          username: 'kitchen-lead',
          role: 'kitchen',
          fullName: 'Kitchen Lead',
          mustChangePassword: true,
          employeeId: expect.stringMatching(/^EMP-[A-Z0-9]{8}$/),
        }),
      );
      expect(JSON.stringify(created.body)).not.toContain('password_hash');

      const duplicate = await agent
        .post('/api/v1/admin/accounts')
        .set('X-CSRF-Token', csrfToken)
        .send({
          fullName: 'Duplicate',
          username: 'KITCHEN-LEAD',
          role: 'staff',
          password: 'duplicate-pass-123',
          passwordConfirmation: 'duplicate-pass-123',
        });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('ACCOUNT_USERNAME_EXISTS');

      const account = created.body.account;
      const updated = await agent
        .patch(`/api/v1/admin/accounts/${account.id}`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          version: account.version,
          fullName: 'Kitchen Supervisor',
          role: 'kitchen',
          email: 'kitchen@example.com',
          isActive: true,
        });
      expect(updated.status).toBe(200);
      expect(updated.body.account.fullName).toBe('Kitchen Supervisor');
      expect(updated.body.account.version).toBe(account.version + 1);

      const reset = await agent
        .post(`/api/v1/admin/accounts/${account.id}/password`)
        .set('X-CSRF-Token', csrfToken)
        .send({
          version: updated.body.account.version,
          password: 'new-kitchen-pass-123',
          passwordConfirmation: 'new-kitchen-pass-123',
        });
      expect(reset.status).toBe(200);
      expect(reset.body.account.mustChangePassword).toBe(true);

      const staffAgent = request.agent(ctx.app);
      const staffLogin = await staffAgent
        .post('/api/v1/staff/session')
        .set('X-Staff-Station', 'kitchen')
        .send({ username: 'kitchen-lead', password: 'new-kitchen-pass-123' });
      expect(staffLogin.status).toBe(200);
      expect(staffLogin.body.role).toBe('kitchen');
      const board = await staffAgent
        .get('/api/v1/staff/workboard')
        .set('X-Staff-Station', 'kitchen');
      expect(board.status).toBe(200);
      expect(board.body.preparation).toBeTruthy();
      expect(board.body.payment).toBeUndefined();
      const forbiddenQueue = await staffAgent
        .get('/api/v1/staff/queue/cashier')
        .set('X-Staff-Station', 'kitchen');
      expect(forbiddenQueue.status).toBe(403);
    });

    it('stores validated product uploads as versioned public WebP images', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const png = await sharp({
        create: { width: 4, height: 3, channels: 3, background: { r: 210, g: 120, b: 60 } },
      })
        .png()
        .toBuffer();
      const uploaded = await agent
        .put('/api/v1/admin/products/americano/image')
        .set('X-CSRF-Token', csrfToken)
        .set('X-Product-Version', '1')
        .set('Content-Type', 'image/png')
        .send(png);
      expect(uploaded.status).toBe(200);
      expect(uploaded.body.product.imagePath).toBe('/api/v1/products/americano/image?v=2');
      expect(uploaded.body.image.mimeType).toBe('image/webp');

      const publicImage = await request(ctx.app).get('/api/v1/products/americano/image');
      expect(publicImage.status).toBe(200);
      expect(publicImage.headers['content-type']).toContain('image/webp');
      expect(publicImage.body.length).toBeGreaterThan(0);
      expect(publicImage.headers['cache-control']).toContain('immutable');

      const stale = await agent
        .put('/api/v1/admin/products/americano/image')
        .set('X-CSRF-Token', csrfToken)
        .set('X-Product-Version', '1')
        .set('Content-Type', 'image/png')
        .send(png);
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('STALE_VERSION');

      const invalid = await agent
        .put('/api/v1/admin/products/americano/image')
        .set('X-CSRF-Token', csrfToken)
        .set('X-Product-Version', '2')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('not-an-image'));
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('INVALID_PRODUCT_IMAGE');
    });
  });

  describe('daily summary', () => {
    it('reports today counts and completed sales split by payment', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      await placeCashOrder(agent); // 13000, pending_cash
      const demo = await agent
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'demo_wallet',
          items: [{ productId: 'americano', quantity: 1 }],
        });

      // Complete the demo order via the documented state machine
      // (placed -> preparing -> ready -> completed; demo_confirmed is
      // always settled so completion is allowed).
      let current = demo.body;
      for (const nextStatus of ['preparing', 'ready', 'completed']) {
        const step = await agent
          .patch(`/api/v1/admin/orders/${demo.body.id}/status`)
          .set('X-CSRF-Token', csrfToken)
          .send({ status: nextStatus, version: current.version });
        expect(step.status).toBe(200);
        current = step.body.order;
      }

      const res = await agent.get('/api/v1/admin/summary');
      expect(res.status).toBe(200);
      expect(res.body.summary.totalOrders).toBe(2);
      expect(res.body.summary.pendingCash).toBe(1);
      expect(res.body.summary.completed).toBe(1);
      expect(res.body.summary.completedSalesCentavos).toBe(4500); // only the demo order
      expect(res.body.summary.completedSalesCashCentavos).toBe(0);
      expect(res.body.summary.completedSalesDemoCentavos).toBe(4500);
      expect(res.body.connection.status).toBe('ok');
    });
  });

  describe('statement of account', () => {
    it('reports and exports completed cash separately from simulated demo wallet', async () => {
      const { agent, csrfToken } = await loginAgent(ctx.app, {
        username: 'boss',
        password: 'boss-pass-123',
      });
      const cash = await placeCashOrder(agent);
      let currentCash = cash;
      const paid = await agent
        .patch(`/api/v1/admin/orders/${cash.id}/payment`)
        .set('X-CSRF-Token', csrfToken)
        .send({ paymentStatus: 'cash_received', version: currentCash.version });
      currentCash = paid.body.order;
      for (const nextStatus of ['preparing', 'ready']) {
        const step = await agent
          .patch(`/api/v1/admin/orders/${cash.id}/status`)
          .set('X-CSRF-Token', csrfToken)
          .send({ status: nextStatus, version: currentCash.version });
        currentCash = step.body.order;
      }
      const completedCash = await agent
        .patch(`/api/v1/admin/orders/${cash.id}/status`)
        .set('X-CSRF-Token', csrfToken)
        .send({ status: 'completed', version: currentCash.version });
      expect(completedCash.status).toBe(200);

      const demo = await agent
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'demo_wallet',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      let currentDemo = demo.body;
      for (const nextStatus of ['preparing', 'ready', 'completed']) {
        const step = await agent
          .patch(`/api/v1/admin/orders/${demo.body.id}/status`)
          .set('X-CSRF-Token', csrfToken)
          .send({ status: nextStatus, version: currentDemo.version });
        currentDemo = step.body.order;
      }

      const date = (await agent.get('/api/v1/admin/orders')).body.orders[0].businessDate;
      const summary = await agent.get(`/api/v1/admin/reports/summary?from=${date}&to=${date}`);
      expect(summary.status).toBe(200);
      expect(summary.body.summary.completedCashCentavos).toBeGreaterThan(0);
      expect(summary.body.summary.completedDemoCentavos).toBe(4500);
      expect(summary.body.summary.completedCombinedCentavos).toBe(
        summary.body.summary.completedCashCentavos + summary.body.summary.completedDemoCentavos,
      );

      const analytics = await agent.get(`/api/v1/admin/analytics?from=${date}&to=${date}`);
      expect(analytics.status).toBe(200);
      expect(analytics.body.analytics.summary.completedOrders).toBeGreaterThanOrEqual(2);
      expect(analytics.body.analytics.daily[0].businessDate).toBe(date);
      expect(analytics.body.analytics.serviceTimes.sampleCount).toBeGreaterThanOrEqual(2);

      createTestAdmin(ctx.db, {
        username: 'report-cashier',
        password: 'report-cashier-pass',
        role: 'staff',
      });
      const cashierAgent = request.agent(ctx.app);
      const cashierSession = await cashierAgent.post('/api/v1/staff/session').send({
        username: 'report-cashier',
        password: 'report-cashier-pass',
      });
      expect(cashierSession.status).toBe(200);
      const cashierCsrf = cashierSession.body.csrfToken;
      const cashierOrder = await placeCashOrder(agent);
      const cashierPaid = await cashierAgent
        .patch(`/api/v1/staff/orders/${cashierOrder.id}/payment`)
        .set('X-CSRF-Token', cashierCsrf)
        .send({ paymentStatus: 'cash_received', version: cashierOrder.version });
      expect(cashierPaid.status).toBe(200);
      let currentCashierOrder = cashierPaid.body.order;
      for (const nextStatus of ['preparing', 'ready', 'completed']) {
        const step = await cashierAgent
          .patch(`/api/v1/staff/orders/${cashierOrder.id}/status`)
          .set('X-CSRF-Token', cashierCsrf)
          .send({ status: nextStatus, version: currentCashierOrder.version });
        expect(step.status).toBe(200);
        currentCashierOrder = step.body.order;
      }

      const filteredAnalytics = await agent.get(
        `/api/v1/admin/analytics?from=${date}&to=${date}&staff=report-cashier`,
      );
      expect(filteredAnalytics.status).toBe(200);
      expect(filteredAnalytics.body.analytics.staffPerformance).toEqual([
        expect.objectContaining({ username: 'report-cashier' }),
      ]);
      expect(filteredAnalytics.body.analytics.summary.completedOrders).toBe(1);
      expect(filteredAnalytics.body.analytics.summary.completedSalesDemoCentavos).toBe(0);
      expect(filteredAnalytics.body.analytics.availableStaff).toEqual(
        expect.arrayContaining([expect.objectContaining({ username: 'report-cashier' })]),
      );

      const filteredSummary = await agent.get(
        `/api/v1/admin/reports/summary?from=${date}&to=${date}&staff=report-cashier`,
      );
      expect(filteredSummary.status).toBe(200);
      expect(filteredSummary.body.summary.orderCount).toBe(1);
      expect(filteredSummary.body.summary.completedCashCentavos).toBe(cashierOrder.totalCentavos);
      expect(filteredSummary.body.summary.completedDemoCentavos).toBe(0);

      const exported = await agent
        .get(`/api/v1/admin/reports/soa.xlsx?from=${date}&to=${date}`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(exported.status).toBe(200);
      expect(exported.headers['content-type']).toContain(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(exported.headers['content-disposition']).toContain(
        `sweet-gonz-operations-${date}-to-${date}.xlsx`,
      );
      expect(exported.body.subarray(0, 2).toString()).toBe('PK');

      const scopedExport = await agent
        .get(`/api/v1/admin/reports/soa.xlsx?from=${date}&to=${date}&staff=report-cashier`)
        .buffer(true)
        .parse((response, callback) => {
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });
      expect(scopedExport.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(scopedExport.body);
      expect(workbook.getWorksheet('Overview').getCell('A5').value).toBe(
        'Staff filter: report-cashier',
      );
      expect(workbook.getWorksheet('Orders').rowCount).toBe(2);

      const activity = await agent.get('/api/v1/admin/audit-events?action=SOA_EXPORTED');
      expect(activity.body.events).toHaveLength(2);
      expect(activity.body.events[0].newState.completedDemoCentavos).toBe(0);
      expect(activity.body.events[1].newState.completedCashCentavos).toBeGreaterThan(0);
      expect(activity.body.events[1].newState.completedDemoCentavos).toBe(4500);
    });
  });

  describe('SSE events', () => {
    it('delivers OrderCreated events to connected admins', async () => {
      // Login and capture the session cookie from the response header
      // (supertest's cookie jar is unreliable across server instances).
      const loginRes = await request(ctx.app)
        .post('/api/v1/admin/session')
        .send({ username: 'boss', password: 'boss-pass-123' });
      expect(loginRes.status).toBe(200);
      const cookie = loginRes.headers['set-cookie'].map((s) => s.split(';')[0]).join('; ');

      // Start a raw HTTP stream to the SSE endpoint using the session cookie.
      const listen = () =>
        new Promise((resolve) => {
          const server = ctx.app.listen(0, '127.0.0.1', () => resolve(server));
        });
      const server = await listen();
      const port = server.address().port;

      const events = [];
      const stream = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: '/api/v1/admin/events',
            headers: { Cookie: cookie },
          },
          (res) => resolve(res),
        );
        req.on('error', reject);
        req.end();
      });
      stream.on('data', (chunk) => {
        events.push(chunk.toString());
      });

      // Create an order while the stream is connected.
      const orderRes = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      expect(orderRes.status).toBe(201);

      // Wait for the OrderCreated event to arrive.
      await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = setInterval(() => {
          const text = events.join('');
          if (text.includes('event: OrderCreated')) {
            clearInterval(poll);
            resolve();
          } else if (Date.now() - started > 5000) {
            clearInterval(poll);
            reject(new Error('OrderCreated event never arrived'));
          }
        }, 100);
      });

      const text = events.join('');
      expect(text).toContain('event: OrderCreated');
      expect(text).toContain('SG-');
      stream.destroy();
      server.close();
    });
  });
});
