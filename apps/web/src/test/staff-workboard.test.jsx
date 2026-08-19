import { describe, expect, it } from 'vitest';
import { ageLabel, orderState, priorityScore } from '../staff/StaffOperations.jsx';

const now = Date.parse('2026-08-19T10:10:00.000Z');

function order(overrides = {}) {
  return {
    id: overrides.id || 'order-1',
    orderNumber: overrides.orderNumber || 'SG-20260819-001',
    createdAt: overrides.createdAt || '2026-08-19T10:00:00.000Z',
    itemCount: overrides.itemCount || 1,
    items: overrides.items || [{ productName: 'Americano', quantity: 1, options: [], addons: [] }],
    ...overrides,
  };
}

describe('staff workboard priority model', () => {
  it('shows an explicit state and wait age for every operational stage', () => {
    expect(orderState(order(), 'payment', now)).toMatchObject({
      label: 'Payment due',
      action: 'Confirm cash',
      age: '10m 00s waiting',
    });
    expect(
      orderState(
        order({
          status: 'placed',
          paymentConfirmedAt: '2026-08-19T10:04:00.000Z',
        }),
        'preparation',
        now,
      ),
    ).toMatchObject({ label: 'Paid · not started', action: 'Start preparation' });
    expect(
      orderState(order({ status: 'ready', readyAt: '2026-08-19T10:08:00.000Z' }), 'handoff', now),
    ).toMatchObject({ label: 'Ready for handoff', action: 'Mark served' });
  });

  it('prioritizes handoff and urgent preparation before payment and normal prep', () => {
    const handoff = {
      lane: 'handoff',
      order: order({ id: 'handoff', readyAt: '2026-08-19T10:00:00.000Z' }),
    };
    const urgentPreparation = {
      lane: 'preparation',
      order: order({
        id: 'urgent-prep',
        status: 'preparing',
        preparingAt: '2026-08-19T10:01:00.000Z',
      }),
    };
    const payment = { lane: 'payment', order: order({ id: 'payment' }) };
    const normalPreparation = {
      lane: 'preparation',
      order: order({ id: 'normal-prep', status: 'placed' }),
    };

    expect(priorityScore(handoff, now)).toBeLessThan(priorityScore(urgentPreparation, now));
    expect(priorityScore(urgentPreparation, now)).toBeLessThan(priorityScore(payment, now));
    expect(priorityScore(payment, now)).toBeLessThan(priorityScore(normalPreparation, now));
  });

  it('keeps an eight-order queue actionable without changing the status model', () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      lane: 'payment',
      order: order({
        id: `payment-${index}`,
        orderNumber: `SG-20260819-${String(index + 1).padStart(3, '0')}`,
        createdAt: new Date(now - (index + 1) * 60_000).toISOString(),
      }),
    }));
    const sorted = [...items].sort(
      (a, b) =>
        priorityScore(a, now) - priorityScore(b, now) ||
        new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime(),
    );

    expect(sorted).toHaveLength(8);
    expect(ageLabel(sorted[0].order, sorted[0].lane, now)).toBe('8m 00s waiting');
    expect(new Set(sorted.map((item) => orderState(item.order, item.lane, now).label))).toEqual(
      new Set(['Payment due']),
    );
  });
});
