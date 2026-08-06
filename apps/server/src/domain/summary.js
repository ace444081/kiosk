import { businessDateString, nowManila } from './order-number.js';
import { OrderRepository } from '../repositories/orders.js';
import { isPaymentConfirmed } from '@kiosk/shared';

/**
 * Daily operational summary for the dashboard. Only completed orders with a
 * confirmed payment (cash_received or demo_confirmed) count toward
 * completed-sales totals. Demo totals are always reported separately so the
 * UI can label them as simulated.
 */
export function buildDailySummary(db, dateTime = nowManila()) {
  const orders = new OrderRepository(db);
  const businessDate = businessDateString(dateTime);
  const today = orders.list({ date: businessDate });

  const summary = {
    businessDate,
    totalOrders: today.length,
    pendingCash: today.filter((o) => o.payment_status === 'pending_cash').length,
    placed: today.filter((o) => o.status === 'placed').length,
    preparing: today.filter((o) => o.status === 'preparing').length,
    ready: today.filter((o) => o.status === 'ready').length,
    completed: today.filter((o) => o.status === 'completed').length,
    cancelled: today.filter((o) => o.status === 'cancelled').length,
    completedSalesCentavos: 0,
    completedSalesCashCentavos: 0,
    completedSalesDemoCentavos: 0,
  };

  for (const order of today) {
    if (order.status === 'completed' && isPaymentConfirmed(order.payment_status)) {
      summary.completedSalesCentavos += order.total_centavos;
      if (order.payment_method === 'cash') {
        summary.completedSalesCashCentavos += order.total_centavos;
      } else {
        summary.completedSalesDemoCentavos += order.total_centavos;
      }
    }
  }

  return summary;
}
