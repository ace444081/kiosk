import { describe, expect, it } from 'vitest';
import { buildDashboardAnalytics } from '../../src/services/dashboard-analytics.js';

const baseOrder = {
  business_date: '2026-08-06',
  payment_method: 'cash',
  payment_status: 'cash_received',
  total_centavos: 10000,
  created_at: '2026-08-06T09:00:00.000Z',
  payment_confirmed_at: '2026-08-06T09:05:00.000Z',
  preparing_at: '2026-08-06T09:06:00.000Z',
  ready_at: '2026-08-06T09:16:00.000Z',
  completed_at: '2026-08-06T09:18:00.000Z',
};

describe('buildDashboardAnalytics', () => {
  it('keeps real cash and demo wallet sales separate', () => {
    const analytics = buildDashboardAnalytics({
      from: '2026-08-06',
      to: '2026-08-06',
      orders: [
        { ...baseOrder, order_number: 'SG-001', status: 'completed' },
        {
          ...baseOrder,
          order_number: 'SG-002',
          status: 'completed',
          payment_method: 'demo_wallet',
          payment_status: 'demo_confirmed',
          total_centavos: 2500,
        },
        {
          ...baseOrder,
          order_number: 'SG-003',
          status: 'cancelled',
          payment_status: 'pending_cash',
          completed_at: null,
        },
      ],
      items: [
        {
          order_number: 'SG-001',
          business_date: '2026-08-06',
          status: 'completed',
          payment_method: 'cash',
          payment_status: 'cash_received',
          product_sku: 'americano',
          product_name: 'Americano',
          quantity: 2,
          line_total_centavos: 10000,
        },
        {
          order_number: 'SG-002',
          business_date: '2026-08-06',
          status: 'completed',
          payment_method: 'demo_wallet',
          payment_status: 'demo_confirmed',
          product_sku: 'americano',
          product_name: 'Americano',
          quantity: 1,
          line_total_centavos: 2500,
        },
      ],
    });

    expect(analytics.summary.totalOrders).toBe(3);
    expect(analytics.summary.completed).toBe(2);
    expect(analytics.summary.cancelled).toBe(1);
    expect(analytics.summary.completedSalesCashCentavos).toBe(10000);
    expect(analytics.summary.completedSalesDemoCentavos).toBe(2500);
    expect(analytics.summary.pendingCash).toBe(1);
    expect(analytics.paymentMix[0].share).toBeCloseTo(0.8);
    expect(analytics.topProducts[0]).toMatchObject({ sku: 'americano', units: 3 });
    expect(analytics.serviceTimes.totalMinutes).toBe(18);
  });

  it('returns zero-safe daily rows for an empty selected period', () => {
    const analytics = buildDashboardAnalytics({
      from: '2026-08-06',
      to: '2026-08-07',
      orders: [],
      items: [],
    });

    expect(analytics.daily).toHaveLength(2);
    expect(analytics.daily[0]).toMatchObject({ businessDate: '2026-08-06', orders: 0 });
    expect(analytics.daily[1]).toMatchObject({ businessDate: '2026-08-07', orders: 0 });
    expect(analytics.summary.averageOrderValueCentavos).toBeNull();
    expect(analytics.summary.completionRate).toBeNull();
  });
});
