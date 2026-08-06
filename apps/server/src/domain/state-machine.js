import { ORDER_STATUS_TRANSITIONS, PAYMENT_TRANSITIONS } from '@kiosk/shared';

/**
 * Pure preparation-status state machine.
 * Returns the allowed next statuses or throws for an invalid transition.
 */
export function canTransitionStatus(from, to) {
  if (from === to) return true;
  const allowed = ORDER_STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Preparation may begin only after the order's payment is settled. This is
 * intentionally separate from the status graph so the status transition stays
 * pure while the business rule remains explicit and testable.
 */
export function canStartPreparing(order) {
  return (
    order?.status === 'placed' &&
    (order.payment_status === 'cash_received' || order.payment_status === 'demo_confirmed')
  );
}

export function nextStatuses(from) {
  return [...(ORDER_STATUS_TRANSITIONS[from] || [])];
}

/**
 * Payment rules.
 * - cash orders start pending_cash and may move to cash_received only.
 * - demo orders stay demo_confirmed forever.
 */
export function canTransitionPayment(from, to) {
  if (from === to) return true;
  const allowed = PAYMENT_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * A cash order may only be completed after cash_received.
 * Demo orders are always considered settled (simulated).
 */
export function canCompleteOrder(order) {
  if (order.payment_method === 'cash') {
    return order.payment_status === 'cash_received';
  }
  return order.payment_status === 'demo_confirmed';
}
