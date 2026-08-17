import { isPaymentConfirmed } from '@kiosk/shared';

function number(value) {
  return Number(value || 0);
}

function minutesBetween(start, end) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 60_000;
}

function average(values) {
  const usable = values.filter((value) => value != null && Number.isFinite(value));
  if (!usable.length) return null;
  return usable.reduce((total, value) => total + value, 0) / usable.length;
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return numerator / denominator;
}

function datesBetween(from, to) {
  const dates = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(end.getTime())) return dates;
  while (cursor <= end && dates.length <= 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function emptyDay(businessDate) {
  return {
    businessDate,
    orders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    activeOrders: 0,
    realCashCentavos: 0,
    demoCentavos: 0,
    pendingCashCentavos: 0,
  };
}

function isCompletedAndPaid(order) {
  return order.status === 'completed' && isPaymentConfirmed(order.payment_status);
}

export function buildDashboardAnalytics({ orders = [], items = [], from, to }) {
  const completedPaid = orders.filter(isCompletedAndPaid);
  const completedCash = completedPaid.filter(
    (order) => order.payment_method === 'cash' && order.payment_status === 'cash_received',
  );
  const completedDemo = completedPaid.filter(
    (order) => order.payment_method === 'demo_wallet' && order.payment_status === 'demo_confirmed',
  );
  const pendingCash = orders.filter((order) => order.payment_status === 'pending_cash');
  const completedOrCancelled = orders.filter((order) =>
    ['completed', 'cancelled'].includes(order.status),
  );

  const dailyMap = new Map(datesBetween(from, to).map((date) => [date, emptyDay(date)]));
  for (const order of orders) {
    const date = String(order.business_date);
    const day = dailyMap.get(date) || emptyDay(date);
    const total = number(order.total_centavos);
    day.orders += 1;
    if (order.status === 'completed') day.completedOrders += 1;
    if (order.status === 'cancelled') day.cancelledOrders += 1;
    if (!['completed', 'cancelled'].includes(order.status)) day.activeOrders += 1;
    if (order.payment_status === 'pending_cash') day.pendingCashCentavos += total;
    if (isCompletedAndPaid(order)) {
      if (order.payment_method === 'cash') day.realCashCentavos += total;
      else day.demoCentavos += total;
    }
    dailyMap.set(date, day);
  }

  const productMap = new Map();
  for (const item of items) {
    if (!isCompletedAndPaid(item)) continue;
    const key = item.product_sku || item.product_name;
    const product = productMap.get(key) || {
      sku: item.product_sku,
      name: item.product_name,
      units: 0,
      grossCentavos: 0,
      orderNumbers: new Set(),
    };
    product.units += number(item.quantity);
    product.grossCentavos += number(item.line_total_centavos);
    if (item.order_number) product.orderNumbers.add(item.order_number);
    productMap.set(key, product);
  }

  const topProducts = [...productMap.values()]
    .map((product) => ({
      sku: product.sku,
      name: product.name,
      units: product.units,
      grossCentavos: product.grossCentavos,
      orderCount: product.orderNumbers.size,
    }))
    .sort((a, b) => b.units - a.units || b.grossCentavos - a.grossCentavos)
    .slice(0, 10);

  const statusBreakdown = ['placed', 'preparing', 'ready', 'completed', 'cancelled'].map(
    (status) => ({
      status,
      count: orders.filter((order) => order.status === status).length,
    }),
  );
  const paymentMix = [
    {
      method: 'cash',
      label: 'Cash',
      orderCount: completedCash.length,
      amountCentavos: completedCash.reduce((sum, order) => sum + number(order.total_centavos), 0),
    },
    {
      method: 'demo_wallet',
      label: 'Demo wallet (simulated)',
      orderCount: completedDemo.length,
      amountCentavos: completedDemo.reduce((sum, order) => sum + number(order.total_centavos), 0),
    },
  ];
  const completedCombinedCentavos = paymentMix[0].amountCentavos + paymentMix[1].amountCentavos;
  for (const payment of paymentMix) {
    payment.share = percent(payment.amountCentavos, completedCombinedCentavos);
  }

  const serviceSamples = completedPaid.map((order) => ({
    paymentWaitMinutes: minutesBetween(order.created_at, order.payment_confirmed_at),
    prepMinutes: minutesBetween(order.preparing_at, order.ready_at),
    handoffMinutes: minutesBetween(order.ready_at, order.completed_at),
    totalMinutes: minutesBetween(order.created_at, order.completed_at),
  }));
  const serviceTimes = {
    paymentWaitMinutes: average(serviceSamples.map((sample) => sample.paymentWaitMinutes)),
    prepMinutes: average(serviceSamples.map((sample) => sample.prepMinutes)),
    handoffMinutes: average(serviceSamples.map((sample) => sample.handoffMinutes)),
    totalMinutes: average(serviceSamples.map((sample) => sample.totalMinutes)),
    sampleCount: completedPaid.length,
  };

  const completedCombinedCount = completedCash.length + completedDemo.length;
  const completedSalesCentavos = completedCombinedCentavos;
  const summary = {
    from,
    to,
    totalOrders: orders.length,
    pendingCash: pendingCash.length,
    pendingCashCentavos: pendingCash.reduce((sum, order) => sum + number(order.total_centavos), 0),
    placed: orders.filter((order) => order.status === 'placed').length,
    preparing: orders.filter((order) => order.status === 'preparing').length,
    ready: orders.filter((order) => order.status === 'ready').length,
    completed: orders.filter((order) => order.status === 'completed').length,
    cancelled: orders.filter((order) => order.status === 'cancelled').length,
    completedCashOrderCount: completedCash.length,
    completedDemoOrderCount: completedDemo.length,
    completedOrders: completedCombinedCount,
    completedSalesCentavos,
    completedSalesCashCentavos: paymentMix[0].amountCentavos,
    completedSalesDemoCentavos: paymentMix[1].amountCentavos,
    averageOrderValueCentavos: completedCombinedCount
      ? Math.round(completedSalesCentavos / completedCombinedCount)
      : null,
    completionRate: percent(
      orders.filter((order) => order.status === 'completed').length,
      completedOrCancelled.length,
    ),
  };

  const dates = [...dailyMap.keys()].sort();
  return {
    from,
    to,
    summary,
    daily: dates.map((date) => dailyMap.get(date)),
    statusBreakdown,
    paymentMix,
    topProducts,
    serviceTimes,
    coverage: {
      hasData: orders.length > 0,
      firstDate: orders.length ? String(orders[0].business_date) : null,
      lastDate: orders.length ? String(orders[orders.length - 1].business_date) : null,
    },
  };
}
