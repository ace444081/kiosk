import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb } from '../utils.js';
import { OrderService } from '../../src/domain/order-service.js';
import { EventBus } from '../../src/services/event-bus.js';
import { AuditRepository } from '../../src/repositories/audit.js';
import { AppError } from '../../src/utils/app-error.js';

describe('OrderService - pricing and validation (authoritative server-side)', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeTestDb();
    const eventBus = new EventBus();
    ctx.service = new OrderService({
      db: ctx.db,
      eventBus,
      audit: new AuditRepository(ctx.db),
    });
  });

  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  const key = () => `test-key-${Math.random().toString(36).slice(2, 12)}`;

  function create(payload, idempotencyKey) {
    return ctx.service.createOrder({
      input: payload,
      idempotencyKey: idempotencyKey || key(),
      locale: payload.locale || 'en',
      requestId: 'unit-test',
      ip: '127.0.0.1',
    });
  }

  function expectAppError(fn, code) {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe(code);
      return err;
    }
    throw new Error(`Expected AppError ${code} but nothing was thrown`);
  }

  it('calculates line totals from database prices (add-ons + quantity)', () => {
    // Cafe Latte (5500) + Espresso Shot (3500) x2 = 18000
    const result = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [
        { productId: 'cafe-latte', quantity: 2, addonIds: ['addon-espresso-shot'], optionIds: [] },
      ],
    });
    expect(result.order.totalCentavos).toBe(18000);
    expect(result.order.subtotalCentavos).toBe(18000);
    const item = result.order.items[0];
    expect(item.unitPriceCentavos).toBe(9000);
    expect(item.lineTotalCentavos).toBe(18000);
    expect(item.addons).toEqual([
      expect.objectContaining({ id: 'addon-espresso-shot', priceCentavos: 3500 }),
    ]);
  });

  it('includes option prices and required choices in the total', () => {
    const result = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [
        {
          productId: 'crinkled-fries',
          quantity: 1,
          addonIds: [],
          optionIds: ['crinkled-fries__fries-flavor__fries-cheese'],
        },
      ],
    });
    // 6500 + 0-cost option = 6500
    expect(result.order.totalCentavos).toBe(6500);
    expect(result.order.items[0].options[0].name).toBe('Cheese');
  });

  it('rejects a missing required option (fries flavor) with REQUIRED_OPTIONS', () => {
    expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'crinkled-fries', quantity: 1 }],
        }),
      'VALIDATION_ERROR',
    );
  });

  it('rejects too many options in a maxSelect group', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [
            {
              productId: 'crinkled-fries',
              quantity: 1,
              optionIds: [
                'crinkled-fries__fries-flavor__fries-cheese',
                'crinkled-fries__fries-flavor__fries-sour-cream',
              ],
            },
          ],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.optionIds']).toBe('OPTION_LIMIT');
  });

  it('rejects an option that does not belong to the product', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [
            {
              productId: 'hashbrown-2pc',
              quantity: 1,
              optionIds: ['crinkled-fries__fries-flavor__fries-cheese'],
            },
          ],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.optionIds']).toBe('OPTION_NOT_FOUND');
  });

  it('rejects incompatible add-ons (food has no add-ons)', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'baked-macaroni', quantity: 1, addonIds: ['addon-espresso-shot'] }],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.addonIds']).toBe('ADDON_INCOMPATIBLE');
  });

  it('rejects duplicate add-ons before persistence', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [
            {
              productId: 'cafe-latte',
              quantity: 1,
              addonIds: ['addon-espresso-shot', 'addon-espresso-shot'],
              optionIds: [],
            },
          ],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.addonIds']).toBe('DUPLICATE_ADDON');
  });

  it('rejects duplicate options before persistence', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [
            {
              productId: 'crinkled-fries',
              quantity: 1,
              addonIds: [],
              optionIds: [
                'crinkled-fries__fries-flavor__fries-cheese',
                'crinkled-fries__fries-flavor__fries-cheese',
              ],
            },
          ],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.optionIds']).toBe('DUPLICATE_OPTION');
  });

  it('rejects unknown add-ons', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1, addonIds: ['addon-does-not-exist'] }],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.addonIds']).toBe('ADDON_NOT_FOUND');
  });

  it('rejects sold-out products', () => {
    ctx.db.prepare('UPDATE products SET is_available = 0 WHERE id = ?').run('americano');
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'americano', quantity: 1 }],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.productId']).toBe('PRODUCT_UNAVAILABLE');
  });

  it('rejects unknown products', () => {
    const err = expectAppError(
      () =>
        create({
          locale: 'en',
          paymentMethod: 'cash',
          items: [{ productId: 'nope', quantity: 1 }],
        }),
      'VALIDATION_ERROR',
    );
    expect(err.fieldErrors['items.0.productId']).toBe('PRODUCT_NOT_FOUND');
  });

  it('rejects quantities outside 1..20', () => {
    expect(() =>
      create({
        locale: 'en',
        paymentMethod: 'cash',
        items: [{ productId: 'americano', quantity: 0 }],
      }),
    ).toThrow();
    expect(() =>
      create({
        locale: 'en',
        paymentMethod: 'cash',
        items: [{ productId: 'americano', quantity: 21 }],
      }),
    ).toThrow();
  });

  it('accepts quantity 20 (upper bound)', () => {
    const result = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 20 }],
    });
    expect(result.order.items[0].quantity).toBe(20);
    expect(result.order.totalCentavos).toBe(4500 * 20);
  });

  it('idempotency: reusing the key returns the original order, no receipt token', () => {
    const idem = 'idem-unique-1234567890';
    const first = create(
      { locale: 'en', paymentMethod: 'cash', items: [{ productId: 'americano', quantity: 1 }] },
      idem,
    );
    const second = create(
      { locale: 'en', paymentMethod: 'cash', items: [{ productId: 'americano', quantity: 1 }] },
      idem,
    );
    expect(second.duplicate).toBe(true);
    expect(second.order.orderNumber).toBe(first.order.orderNumber);
    expect(second.receiptToken).toBeNull();
    expect(first.receiptToken).toBeTruthy();
  });

  it('idempotency: a different key creates a different order', () => {
    const payload = {
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1 }],
    };
    const a = create(payload);
    const b = create(payload);
    expect(a.order.id).not.toBe(b.order.id);
    expect(a.order.orderNumber).not.toBe(b.order.orderNumber);
  });

  it('cash orders start pending_cash; demo orders start demo_confirmed', () => {
    const cash = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1 }],
    });
    expect(cash.order.paymentStatus).toBe('pending_cash');
    const demo = create({
      locale: 'fil',
      paymentMethod: 'demo_wallet',
      items: [{ productId: 'americano', quantity: 1 }],
    });
    expect(demo.order.paymentStatus).toBe('demo_confirmed');
  });

  it('snapshots product names and prices at order time', () => {
    const result = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1 }],
    });
    const item = result.order.items[0];
    expect(item.productName).toBe('Americano');
    expect(item.unitPriceCentavos).toBe(4500);

    // Mutate the live catalog - snapshot must not change.
    ctx.db
      .prepare('UPDATE products SET name = ?, price_centavos = ? WHERE id = ?')
      .run('Americano NEW', 9999, 'americano');
    const receipt = ctx.service.getReceipt(result.order.orderNumber, result.receiptToken);
    expect(receipt.items[0].productName).toBe('Americano');
    expect(receipt.items[0].unitPriceCentavos).toBe(4500);
  });

  it('receipt lookup requires the correct token (hash-only storage)', () => {
    const result = create({
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1 }],
    });
    expectAppError(
      () => ctx.service.getReceipt(result.order.orderNumber, 'wrong-token'),
      'INVALID_RECEIPT_TOKEN',
    );
    const receipt = ctx.service.getReceipt(result.order.orderNumber, result.receiptToken);
    expect(receipt.orderNumber).toBe(result.order.orderNumber);
  });

  it('demo reference generator produces DEMO-XXXXXXXX shape', () => {
    const ref = OrderService.generateDemoReference();
    expect(ref).toMatch(/^DEMO-[A-Z2-9]{8}$/);
    expect(ref.slice(5)).not.toMatch(/[01OI]/); // no ambiguous characters in the code part
  });

  it('throws AppError with fieldErrors for validation failures', () => {
    try {
      create({
        locale: 'en',
        paymentMethod: 'cash',
        items: [{ productId: 'crinkled-fries', quantity: 1 }],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.fieldErrors['items.0.optionIds']).toBe('REQUIRED_OPTIONS');
    }
  });
});
