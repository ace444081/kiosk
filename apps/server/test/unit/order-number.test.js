import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  allocateOrderNumber,
  businessDateString,
  orderNumberDateString,
} from '../../src/domain/order-number.js';
import { BUSINESS_TIMEZONE } from '@kiosk/shared';

function fakeDb(rows = []) {
  return {
    prepare() {
      return {
        get() {
          return rows.shift() ?? { max_seq: null };
        },
      };
    },
  };
}

describe('order-number (Asia/Manila business date + daily sequence)', () => {
  it('formats the business date in Manila timezone', () => {
    const dt = DateTime.fromISO('2026-08-06T23:30:00', { zone: BUSINESS_TIMEZONE });
    expect(businessDateString(dt)).toBe('2026-08-06');
    expect(orderNumberDateString(dt)).toBe('20260806');
  });

  it('uses Manila date even when UTC has already rolled over', () => {
    // 2026-08-06 00:30 Manila == 2026-08-05 16:30 UTC
    const dt = DateTime.fromISO('2026-08-05T16:30:00Z').setZone(BUSINESS_TIMEZONE);
    expect(businessDateString(dt)).toBe('2026-08-06');
  });

  it('allocates SG-YYYYMMDD-NNN with sequence 1 on an empty day', () => {
    const db = fakeDb();
    const dt = DateTime.fromISO('2026-08-06T10:00:00', { zone: BUSINESS_TIMEZONE });
    const result = allocateOrderNumber(db, dt);
    expect(result).toEqual({
      orderNumber: 'SG-20260806-001',
      businessDate: '2026-08-06',
      dailySequence: 1,
    });
  });

  it('increments the daily sequence and pads to three digits', () => {
    const db = fakeDb([{ max_seq: 41 }]);
    const dt = DateTime.fromISO('2026-08-06T10:00:00', { zone: BUSINESS_TIMEZONE });
    const result = allocateOrderNumber(db, dt);
    expect(result.orderNumber).toBe('SG-20260806-042');
    expect(result.dailySequence).toBe(42);
  });

  it('sequences are per business date (reset each Manila day)', () => {
    const db = fakeDb([{ max_seq: 7 }]);
    const nextDay = DateTime.fromISO('2026-08-07T08:00:00', { zone: BUSINESS_TIMEZONE });
    expect(allocateOrderNumber(db, nextDay).orderNumber).toBe('SG-20260807-008');
  });
});
