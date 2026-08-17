import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createOperationsWorkbook } from '../../src/services/operations-workbook.js';

describe('createOperationsWorkbook', () => {
  it('creates the operations workbook with the planned sheets', async () => {
    const analytics = {
      from: '2026-08-06',
      to: '2026-08-06',
      summary: {
        totalOrders: 1,
        pendingCash: 0,
        pendingCashCentavos: 0,
        completedOrders: 1,
        completedCashOrderCount: 1,
        completedDemoOrderCount: 0,
        completedSalesCashCentavos: 10000,
        completedSalesDemoCentavos: 0,
        averageOrderValueCentavos: 10000,
        completionRate: 1,
      },
      daily: [
        {
          businessDate: '2026-08-06',
          orders: 1,
          completedOrders: 1,
          cancelledOrders: 0,
          activeOrders: 0,
          realCashCentavos: 10000,
          demoCentavos: 0,
          pendingCashCentavos: 0,
        },
      ],
      topProducts: [],
      serviceTimes: {
        sampleCount: 1,
        paymentWaitMinutes: 2,
        prepMinutes: 8,
        handoffMinutes: 1,
        totalMinutes: 11,
      },
      coverage: { hasData: true, firstDate: '2026-08-06', lastDate: '2026-08-06' },
    };
    const summary = {
      from: analytics.from,
      to: analytics.to,
      completedCashCentavos: 10000,
      pendingCashCentavos: 0,
      completedDemoCentavos: 0,
      completedCombinedCentavos: 10000,
      completedCashOrderCount: 1,
      completedDemoOrderCount: 0,
    };
    const buffer = await createOperationsWorkbook({
      summary,
      analytics,
      orders: [],
      items: [],
      auditEvents: [],
      catalog: [],
      generatedBy: 'test-admin',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Overview',
      'Statement of Account',
      'Daily Summary',
      'Orders',
      'Order Items',
      'Product Performance',
      'Service Times',
      'Menu Status',
      'Audit Log',
      'Data Dictionary',
    ]);
    expect(workbook.getWorksheet('Overview').getCell('C8').value).toBe(100);
    expect(workbook.getWorksheet('Daily Summary').getCell('F2').value).toBe(100);
  });
});
