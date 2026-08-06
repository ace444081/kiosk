/**
 * Shared domain constants for the Sweet Gonz kiosk.
 */

export const BUSINESS_TIMEZONE = 'Asia/Manila';

export const ORDER_STATUSES = ['placed', 'preparing', 'ready', 'completed', 'cancelled'];
export const ORDER_STATUS_LABELS = {
  placed: 'Placed',
  preparing: 'Preparing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PAYMENT_METHODS = ['cash', 'demo_wallet'];
export const PAYMENT_STATUSES = ['pending_cash', 'cash_received', 'demo_confirmed'];

export const ORDER_NUMBER_PREFIX = 'SG';
export const ORDER_NUMBER_DATE_FORMAT = 'yyyyMMdd';
export const BUSINESS_DATE_FORMAT = 'yyyy-MM-dd';

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 20;
export const MAX_CART_LINES = 50;

export const LOCALES = ['en', 'fil'];
export const DEFAULT_LOCALE = 'en';

export const IDLE_WARN_MS = 105_000;
export const IDLE_RESET_MS = 120_000;
export const IDLE_CONTINUE_GRACE_MS = 15_000;
export const CONFIRMATION_AUTO_RESET_MS = 20_000;

export const CART_STORAGE_KEY = 'sgkiosk.cart.v1';
export const IDEM_STORAGE_KEY = 'sgkiosk.idempotency.v1';
export const RECEIPT_STORAGE_KEY = 'sgkiosk.receipt.v1';
export const LOCALE_STORAGE_KEY = 'sgkiosk.locale.v1';
export const ADMIN_LOCALE_STORAGE_KEY = 'sgkiosk.admin.locale.v1';

export const SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000; // 8 hours

export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const ADMIN_POLL_MS = 5_000;
export const ADMIN_SSE_RETRY_MS = 3_000;
export const SSE_MAX_BACKLOG = 200;

export const DEMO_REFERENCE_PREFIX = 'DEMO-';

export const MAX_JSON_BODY_BYTES = 100 * 1024; // request-size limit

/**
 * Allowed preparation-status transitions.
 */
export const ORDER_STATUS_TRANSITIONS = {
  placed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/**
 * Allowed payment-status transitions.
 */
export const PAYMENT_TRANSITIONS = {
  pending_cash: ['cash_received'],
  cash_received: [],
  demo_confirmed: [],
};

export const TRANSITION_REASONS = {
  placed_to_preparing: 'started-preparing',
  preparing_to_ready: 'marked-ready',
  ready_to_completed: 'completed',
  to_cancelled: 'cancelled',
  cash_confirmed: 'cash-confirmed',
};

/**
 * Completion-sales rule: only completed orders whose payment is confirmed
 * (cash_received or demo_confirmed) count toward completed-sales totals.
 */
export function isPaymentConfirmed(paymentStatus) {
  return paymentStatus === 'cash_received' || paymentStatus === 'demo_confirmed';
}

/**
 * Pure idle/timeout state computation used by the kiosk timer.
 * Returns 'active' | 'warning' | 'reset'.
 */
export function computeIdleState(lastActivityAt, now) {
  const elapsed = now - lastActivityAt;
  if (elapsed >= IDLE_RESET_MS) return 'reset';
  if (elapsed >= IDLE_WARN_MS) return 'warning';
  return 'active';
}

export function secondsUntilReset(lastActivityAt, now) {
  return Math.max(0, Math.ceil((IDLE_RESET_MS - (now - lastActivityAt)) / 1000));
}
