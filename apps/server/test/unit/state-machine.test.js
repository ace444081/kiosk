import { describe, expect, it } from 'vitest';
import {
  canTransitionStatus,
  canTransitionPayment,
  canCompleteOrder,
  canStartPreparing,
  nextStatuses,
} from '../../src/domain/state-machine.js';

describe('order status state machine', () => {
  it('allows the documented transitions', () => {
    expect(canTransitionStatus('placed', 'preparing')).toBe(true);
    expect(canTransitionStatus('placed', 'cancelled')).toBe(true);
    expect(canTransitionStatus('preparing', 'ready')).toBe(true);
    expect(canTransitionStatus('preparing', 'cancelled')).toBe(true);
    expect(canTransitionStatus('ready', 'completed')).toBe(true);
    expect(canTransitionStatus('ready', 'cancelled')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionStatus('placed', 'ready')).toBe(false);
    expect(canTransitionStatus('placed', 'completed')).toBe(false);
    expect(canTransitionStatus('preparing', 'completed')).toBe(false);
    expect(canTransitionStatus('ready', 'preparing')).toBe(false);
    expect(canTransitionStatus('completed', 'ready')).toBe(false);
    expect(canTransitionStatus('cancelled', 'placed')).toBe(false);
  });

  it('completed and cancelled orders cannot reopen', () => {
    expect(nextStatuses('completed')).toEqual([]);
    expect(nextStatuses('cancelled')).toEqual([]);
  });

  it('self-transitions are allowed (no-op)', () => {
    expect(canTransitionStatus('ready', 'ready')).toBe(true);
  });
});

describe('payment rules', () => {
  it('only allows preparation after payment is settled', () => {
    expect(canStartPreparing({ status: 'placed', payment_status: 'pending_cash' })).toBe(false);
    expect(canStartPreparing({ status: 'placed', payment_status: 'cash_received' })).toBe(true);
    expect(canStartPreparing({ status: 'placed', payment_status: 'demo_confirmed' })).toBe(true);
    expect(canStartPreparing({ status: 'preparing', payment_status: 'cash_received' })).toBe(false);
  });

  it('cash moves pending_cash -> cash_received only', () => {
    expect(canTransitionPayment('pending_cash', 'cash_received')).toBe(true);
    expect(canTransitionPayment('cash_received', 'pending_cash')).toBe(false);
    expect(canTransitionPayment('cash_received', 'demo_confirmed')).toBe(false);
  });

  it('demo orders stay demo_confirmed forever', () => {
    expect(canTransitionPayment('demo_confirmed', 'pending_cash')).toBe(false);
    expect(canTransitionPayment('demo_confirmed', 'cash_received')).toBe(false);
  });

  it('cash orders cannot complete until cash_received', () => {
    const unpaid = { payment_method: 'cash', payment_status: 'pending_cash' };
    const paid = { payment_method: 'cash', payment_status: 'cash_received' };
    expect(canCompleteOrder(unpaid)).toBe(false);
    expect(canCompleteOrder(paid)).toBe(true);
  });

  it('demo orders are always completable (simulated settlement)', () => {
    expect(
      canCompleteOrder({ payment_method: 'demo_wallet', payment_status: 'demo_confirmed' }),
    ).toBe(true);
  });
});
