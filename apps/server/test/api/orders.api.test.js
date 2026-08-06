import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeTestApp, createTestAdmin } from '../utils.js';

describe('public API - menu, orders, receipts, health', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeTestApp();
    createTestAdmin(ctx.db);
  });

  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  const idem = () => `api-key-${Math.random().toString(36).slice(2, 14)}`;

  describe('GET /api/v1/health', () => {
    it('reports ok with database status', async () => {
      const res = await request(ctx.app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.db).toBe('ok');
    });
  });

  describe('GET /api/v1/menu', () => {
    it('returns the seeded catalog localized to en', async () => {
      const res = await request(ctx.app).get('/api/v1/menu?locale=en');
      expect(res.status).toBe(200);
      expect(res.body.locale).toBe('en');
      const snacks = res.body.categories.find((c) => c.id === 'snacks');
      expect(snacks).toBeTruthy();
      const fries = snacks.products.find((p) => p.id === 'crinkled-fries');
      expect(fries.priceCentavos).toBe(6500);
      expect(fries.optionGroups[0].options.map((o) => o.name)).toEqual(['Cheese', 'Sour Cream']);
      expect(fries.description).toContain('fries');
    });

    it('localizes descriptions and names to fil', async () => {
      const res = await request(ctx.app).get('/api/v1/menu?locale=fil');
      const snacks = res.body.categories.find((c) => c.id === 'snacks');
      expect(snacks.name).toBe('Meryenda');
      const fries = snacks.products.find((p) => p.id === 'crinkled-fries');
      expect(fries.description).toContain('lasap');
      expect(fries.optionGroups[0].options[0].name).toBe('Keso');
    });

    it('product names never change between locales', async () => {
      const en = await request(ctx.app).get('/api/v1/menu?locale=en');
      const fil = await request(ctx.app).get('/api/v1/menu?locale=fil');
      const enNames = en.body.categories.flatMap((c) => c.products.map((p) => p.name));
      const filNames = fil.body.categories.flatMap((c) => c.products.map((p) => p.name));
      expect(enNames).toEqual(filNames);
    });
  });

  describe('POST /api/v1/orders', () => {
    it('creates a valid cash order', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'hashbrown-2pc', quantity: 2 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.orderNumber).toMatch(/^SG-\d{8}-\d{3}$/);
      expect(res.body.status).toBe('placed');
      expect(res.body.paymentStatus).toBe('pending_cash');
      expect(res.body.totalCentavos).toBe(13000);
      expect(res.body.receiptToken).toBeTruthy();
      expect(res.body.duplicate).toBe(false);
    });

    it('creates a valid demo e-wallet order', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'fil',
          paymentMethod: 'demo_wallet',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      expect(res.status).toBe(201);
      expect(res.body.paymentMethod).toBe('demo_wallet');
      expect(res.body.paymentStatus).toBe('demo_confirmed');
    });

    it('rejects an empty cart', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({ locale: 'en', paymentMethod: 'cash', items: [] });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.requestId).toBeTruthy();
    });

    it('rejects a missing Idempotency-Key header', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_MISSING');
    });

    it('rejects an unknown product', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'ghost-product', quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors['items.0.productId']).toBe('PRODUCT_NOT_FOUND');
    });

    it('rejects a sold-out product', async () => {
      ctx.db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run('americano');
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors['items.0.productId']).toBe('PRODUCT_UNAVAILABLE');
    });

    it('rejects an incompatible add-on', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'baked-macaroni', quantity: 1, addonIds: ['addon-espresso-shot'] }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors['items.0.addonIds']).toBe('ADDON_INCOMPATIBLE');
    });

    it('rejects missing fries flavor (required option)', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'crinkled-fries', quantity: 1 }],
        });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors['items.0.optionIds']).toBe('REQUIRED_OPTIONS');
    });

    it('ignores a fake client price and prices from the catalog', async () => {
      const res = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [
            { productId: 'hashbrown-2pc', quantity: 2, priceCentavos: 1, lineTotalCentavos: 2 },
          ],
        });
      expect(res.status).toBe(201);
      expect(res.body.totalCentavos).toBe(13000); // 2 x 6500, NOT 2
      expect(res.body.items[0].unitPriceCentavos).toBe(6500);
    });

    it('is idempotent: duplicate key returns the original order', async () => {
      const key = idem();
      const payload = {
        locale: 'en',
        paymentMethod: 'cash',
        items: [{ productId: 'americano', quantity: 1 }],
      };
      const first = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', key)
        .send(payload);
      const second = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', key)
        .send(payload);
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.duplicate).toBe(true);
      expect(second.body.orderNumber).toBe(first.body.orderNumber);
      expect(second.body.receiptToken).toBeNull();
      const count = ctx.db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
      expect(count).toBe(1);
    });

    it('does not reset the daily sequence on duplicate submissions', async () => {
      const key = idem();
      const payload = {
        locale: 'en',
        paymentMethod: 'cash',
        items: [{ productId: 'americano', quantity: 1 }],
      };
      await request(ctx.app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload);
      await request(ctx.app).post('/api/v1/orders').set('Idempotency-Key', key).send(payload);
      const next = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send(payload);
      expect(next.body.dailySequence).toBe(2);
    });
  });

  describe('GET /api/v1/orders/:orderNumber/receipt', () => {
    it('returns the receipt for the correct token', async () => {
      const created = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      const res = await request(ctx.app).get(
        `/api/v1/orders/${created.body.orderNumber}/receipt?token=${created.body.receiptToken}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.receipt.orderNumber).toBe(created.body.orderNumber);
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('404s for a wrong token (hash-only storage)', async () => {
      const created = await request(ctx.app)
        .post('/api/v1/orders')
        .set('Idempotency-Key', idem())
        .send({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        });
      const res = await request(ctx.app).get(
        `/api/v1/orders/${created.body.orderNumber}/receipt?token=wrong-token`,
      );
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('INVALID_RECEIPT_TOKEN');
    });
  });
});
