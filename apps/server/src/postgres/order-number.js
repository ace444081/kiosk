import { DateTime } from 'luxon';
import { BUSINESS_TIMEZONE } from '@kiosk/shared';

/** Allocate a daily sequence atomically inside the caller's transaction. */
export async function allocatePostgresOrderNumber(db) {
  const businessDate = DateTime.now().setZone(BUSINESS_TIMEZONE).toFormat('yyyy-MM-dd');
  const row = await db.one(
    `INSERT INTO daily_order_sequences (business_date, last_value)
     VALUES ($1::date, 1)
     ON CONFLICT (business_date)
     DO UPDATE SET last_value = daily_order_sequences.last_value + 1
     RETURNING last_value`,
    [businessDate],
  );
  return {
    businessDate,
    dailySequence: row.last_value,
    orderNumber: `SG-${businessDate.replaceAll('-', '')}-${String(row.last_value).padStart(3, '0')}`,
  };
}
