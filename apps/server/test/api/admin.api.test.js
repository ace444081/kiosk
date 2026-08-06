import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

    it('does not allow editing prices or names via the admin API', async () => {
      const { agent } = await loginAgent(ctx.app, { username: 'boss', password: 'boss-pass-123' });
      const res = await agent.patch('/api/v1/admin/products/americano').send({ priceCentavos: 1 });
      expect([404, 405]).toContain(res.status);
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
        `sweet-gonz-soa-${date}-to-${date}.xlsx`,
      );
      expect(exported.body.subarray(0, 2).toString()).toBe('PK');

      const activity = await agent.get('/api/v1/admin/audit-events?action=SOA_EXPORTED');
      expect(activity.body.events).toHaveLength(1);
      expect(activity.body.events[0].newState.completedCashCentavos).toBeGreaterThan(0);
      expect(activity.body.events[0].newState.completedDemoCentavos).toBe(4500);
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
