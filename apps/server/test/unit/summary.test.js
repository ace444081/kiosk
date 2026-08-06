import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { makeTestDb } from '../utils.js';
import { buildDailySummary } from '../../src/domain/summary.js';
import { OrderRepository } from '../../src/repositories/orders.js';
import { allocateOrderNumber } from '../../src/domain/order-number.js';
import { sha256Hex, generateToken } from '../../src/security/tokens.js';
import { BUSINESS_TIMEZONE } from '@kiosk/shared';

describe('buildDailySummary', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeTestDb();
  });

  afterEach(() => {
    ctx.db.close();
    ctx.cleanup();
  });

  function insertOrder({ status, paymentMethod, paymentStatus, totalCentavos, dateTime }) {
    const orders = new OrderRepository(ctx.db);
    const { orderNumber, businessDate, dailySequence } = allocateOrderNumber(ctx.db, dateTime);
    return orders.insert({
      orderNumber,
      businessDate,
      dailySequence,
      status,
      paymentMethod,
      paymentStatus,
      locale: 'en',
      subtotalCentavos: totalCentavos,
      totalCentavos,
      idempotencyKey: `idem-${orderNumber}-${Math.random().toString(36).slice(2, 10)}`,
      receiptTokenHash: sha256Hex(generateToken(24)),
      items: [],
    });
  }

  const today = DateTime.now().setZone(BUSINESS_TIMEZONE);
  const yesterday = today.minus({ days: 1 });

  it('counts statuses and pending cash for the business date', () => {
    insertOrder({
      status: 'placed',
      paymentMethod: 'cash',
      paymentStatus: 'pending_cash',
      totalCentavos: 10000,
      dateTime: today,
    });
    insertOrder({
      status: 'preparing',
      paymentMethod: 'cash',
      paymentStatus: 'pending_cash',
      totalCentavos: 20000,
      dateTime: today,
    });
    insertOrder({
      status: 'ready',
      paymentMethod: 'cash',
      paymentStatus: 'pending_cash',
      totalCentavos: 30000,
      dateTime: today,
    });
    insertOrder({
      status: 'cancelled',
      paymentMethod: 'cash',
      paymentStatus: 'pending_cash',
      totalCentavos: 40000,
      dateTime: today,
    });
    insertOrder({
      status: 'completed',
      paymentMethod: 'cash',
      paymentStatus: 'cash_received',
      totalCentavos: 50000,
      dateTime: today,
    });
    // Yesterday's order must NOT count toward today.
    insertOrder({
      status: 'completed',
      paymentMethod: 'cash',
      paymentStatus: 'cash_received',
      totalCentavos: 999999,
      dateTime: yesterday,
    });

    const summary = buildDailySummary(ctx.db, today);
    expect(summary.businessDate).toBe(today.toFormat('yyyy-MM-dd'));
    expect(summary.totalOrders).toBe(5);
    // All non-cash_received orders await payment, including the cancelled one.
    expect(summary.pendingCash).toBe(4);
    expect(summary.placed).toBe(1);
    expect(summary.preparing).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.completedSalesCentavos).toBe(50000);
  });

  it('only completed orders with confirmed payment count toward sales', () => {
    insertOrder({
      status: 'completed',
      paymentMethod: 'cash',
      paymentStatus: 'pending_cash',
      totalCentavos: 11111,
      dateTime: today,
    });
    insertOrder({
      status: 'ready',
      paymentMethod: 'cash',
      paymentStatus: 'cash_received',
      totalCentavos: 22222,
      dateTime: today,
    });
    insertOrder({
      status: 'completed',
      paymentMethod: 'demo_wallet',
      paymentStatus: 'demo_confirmed',
      totalCentavos: 33333,
      dateTime: today,
    });
    insertOrder({
      status: 'completed',
      paymentMethod: 'cash',
      paymentStatus: 'cash_received',
      totalCentavos: 44444,
      dateTime: today,
    });

    const summary = buildDailySummary(ctx.db, today);
    expect(summary.completedSalesCentavos).toBe(33333 + 44444);
    expect(summary.completedSalesCashCentavos).toBe(44444);
    expect(summary.completedSalesDemoCentavos).toBe(33333);
  });

  it('empty day yields zeroed summary', () => {
    const summary = buildDailySummary(ctx.db, today);
    expect(summary.totalOrders).toBe(0);
    expect(summary.completedSalesCentavos).toBe(0);
  });
});
