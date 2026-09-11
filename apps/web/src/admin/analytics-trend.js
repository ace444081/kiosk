const DAY_MS = 24 * 60 * 60 * 1000;

function dateValue(date) {
  return new Date(`${date}T00:00:00Z`);
}

function isoDate(value) {
  return value.toISOString().slice(0, 10);
}

export function rangeLength(from, to) {
  const start = dateValue(from);
  const end = dateValue(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 1;
  return Math.max(1, Math.round((end - start) / DAY_MS) + 1);
}

export function trendGranularity(from, to) {
  const days = rangeLength(from, to);
  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  if (days <= 730) return 'month';
  return 'year';
}

function startOfWeek(date) {
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setUTCDate(start.getUTCDate() + offset);
  return start;
}

function bucketKey(date, granularity) {
  if (granularity === 'year') return date.toISOString().slice(0, 4);
  if (granularity === 'month') return date.toISOString().slice(0, 7);
  if (granularity === 'week') return isoDate(startOfWeek(date));
  return isoDate(date);
}

function bucketLabel(key, granularity) {
  if (granularity === 'year') return key;
  if (granularity === 'month') {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(dateValue(`${key}-01`));
  }
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dateValue(key));
}

export function aggregateTrend(daily = [], from, to) {
  const granularity = trendGranularity(from, to);
  const buckets = new Map();
  for (const day of daily) {
    const key = bucketKey(dateValue(day.businessDate), granularity);
    const current = buckets.get(key) || {
      key,
      label: bucketLabel(key, granularity),
      orders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      activeOrders: 0,
      cashCentavos: 0,
      demoCentavos: 0,
      pendingCashCentavos: 0,
    };
    current.orders += Number(day.orders || 0);
    current.completedOrders += Number(day.completedOrders || 0);
    current.cancelledOrders += Number(day.cancelledOrders || 0);
    current.activeOrders += Number(day.activeOrders || 0);
    current.cashCentavos += Number(day.realCashCentavos || 0);
    current.demoCentavos += Number(day.demoCentavos || 0);
    current.pendingCashCentavos += Number(day.pendingCashCentavos || 0);
    buckets.set(key, current);
  }
  return {
    granularity,
    rows: [...buckets.values()].sort((left, right) => left.key.localeCompare(right.key)),
  };
}
