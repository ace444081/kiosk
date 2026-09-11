import { describe, expect, it } from 'vitest';
import { aggregateTrend, trendGranularity } from '../admin/AnalyticsWidgets.jsx';

describe('analytics trend bucketing', () => {
  it('chooses readable granularity for short and long ranges', () => {
    expect(trendGranularity('2026-09-11', '2026-09-11')).toBe('day');
    expect(trendGranularity('2026-07-01', '2026-08-29')).toBe('week');
    expect(trendGranularity('2026-01-01', '2026-07-19')).toBe('month');
    expect(trendGranularity('2024-01-01', '2026-09-11')).toBe('year');
  });

  it('sums source daily rows without losing zero-activity periods', () => {
    const trend = aggregateTrend(
      [
        {
          businessDate: '2026-01-01',
          orders: 2,
          completedOrders: 1,
          realCashCentavos: 1000,
          demoCentavos: 500,
        },
        {
          businessDate: '2026-01-02',
          orders: 0,
          completedOrders: 0,
          realCashCentavos: 0,
          demoCentavos: 0,
        },
        {
          businessDate: '2026-01-03',
          orders: 1,
          completedOrders: 1,
          realCashCentavos: 2500,
          demoCentavos: 0,
        },
      ],
      '2026-01-01',
      '2026-01-03',
    );
    expect(trend.granularity).toBe('day');
    expect(trend.rows).toHaveLength(3);
    expect(trend.rows[1]).toMatchObject({ label: 'Jan 2', orders: 0 });
    expect(trend.rows[2]).toMatchObject({ cashCentavos: 2500, orders: 1 });
  });
});
