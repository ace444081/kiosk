import { DateTime } from 'luxon';
import {
  BUSINESS_TIMEZONE,
  BUSINESS_DATE_FORMAT,
  ORDER_NUMBER_PREFIX,
  ORDER_NUMBER_DATE_FORMAT,
} from '@kiosk/shared';

export function nowManila() {
  return DateTime.now().setZone(BUSINESS_TIMEZONE);
}

export function businessDateString(dateTime = nowManila()) {
  return dateTime.toFormat(BUSINESS_DATE_FORMAT);
}

export function orderNumberDateString(dateTime = nowManila()) {
  return dateTime.toFormat(ORDER_NUMBER_DATE_FORMAT);
}

/**
 * Allocate the next order number and daily sequence for a business date.
 * MUST be called inside the order-creation immediate transaction.
 */
export function allocateOrderNumber(db, dateTime = nowManila()) {
  const businessDate = businessDateString(dateTime);
  const datePart = orderNumberDateString(dateTime);
  const row = db
    .prepare('SELECT MAX(daily_sequence) AS max_seq FROM orders WHERE business_date = ?')
    .get(businessDate);
  const dailySequence = (row?.max_seq ?? 0) + 1;
  const orderNumber = `${ORDER_NUMBER_PREFIX}-${datePart}-${String(dailySequence).padStart(3, '0')}`;
  return { orderNumber, businessDate, dailySequence };
}

export function formatManilaIso(dateTime = nowManila()) {
  return dateTime.toISO();
}

export function toManilaIso(utcIso) {
  const dt = DateTime.fromISO(utcIso, { zone: 'utc' }).setZone(BUSINESS_TIMEZONE);
  return dt.toISO();
}
