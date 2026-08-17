const BUSINESS_TIMEZONE = 'Asia/Manila';

export function manilaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function shiftBusinessDate(date, offset) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

export function formatBusinessDate(date) {
  if (!date) return '';
  const value = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}

export function presetRange(preset, today = manilaDate()) {
  if (preset === 'yesterday') {
    const date = shiftBusinessDate(today, -1);
    return { from: date, to: date };
  }
  if (preset === 'last7') return { from: shiftBusinessDate(today, -6), to: today };
  if (preset === 'last30') return { from: shiftBusinessDate(today, -29), to: today };
  return { from: today, to: today };
}

export { BUSINESS_TIMEZONE };
