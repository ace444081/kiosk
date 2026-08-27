import { describe, expect, it } from 'vitest';
import { buildCashierReportSummary } from '../admin/AdminReports.jsx';

describe('buildCashierReportSummary', () => {
  it('summarizes every staff account while selecting the strongest cashier deterministically', () => {
    const summary = buildCashierReportSummary([
      {
        username: 'cashier-b',
        active: true,
        cashConfirmedOrders: 2,
        cashCollectedCentavos: 15000,
      },
      {
        username: 'cashier-a',
        active: false,
        cashConfirmedOrders: 2,
        cashCollectedCentavos: 15000,
      },
      {
        username: 'cashier-c',
        active: true,
        cashConfirmedOrders: 0,
        cashCollectedCentavos: 0,
      },
    ]);

    expect(summary).toMatchObject({
      totalConfirmations: 4,
      totalCollectedCentavos: 30000,
      activeCashiers: 2,
      averageCashOrderCentavos: 7500,
      topCashier: { username: 'cashier-a', cashCollectedCentavos: 15000 },
    });
  });

  it('returns zero-safe values when staff have not confirmed cash', () => {
    expect(
      buildCashierReportSummary([
        { username: 'cashier-a', active: true, cashConfirmedOrders: 0, cashCollectedCentavos: 0 },
      ]),
    ).toMatchObject({
      totalConfirmations: 0,
      totalCollectedCentavos: 0,
      averageCashOrderCentavos: null,
      topCashier: null,
    });
  });
});
