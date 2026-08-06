import { describe, expect, it } from 'vitest';
import i18n from '../i18n/index.js';
import en from '../i18n/en.json';
import fil from '../i18n/fil.json';

/** Flatten a nested dictionary into "section.key" paths. */
function flatten(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flatten(value, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe('translation dictionaries', () => {
  it('every key in English exists in Filipino (parity test)', () => {
    const enKeys = new Set(flatten(en));
    const filKeys = new Set(flatten(fil));
    const missingInFil = [...enKeys].filter((key) => !filKeys.has(key));
    expect(missingInFil).toEqual([]);
  });

  it('every key in Filipino exists in English', () => {
    const enKeys = new Set(flatten(en));
    const filKeys = new Set(flatten(fil));
    const missingInEn = [...filKeys].filter((key) => !enKeys.has(key));
    expect(missingInEn).toEqual([]);
  });

  it('Filipino values are not identical to English values (actually translated)', () => {
    const enKeys = flatten(en);
    const identical = enKeys.filter((key) => {
      const enValue = en[key.split('.').reduce((o, k) => o[k], en)];
      const filValue = fil[key.split('.').reduce((o, k) => o[k], fil)];
      return typeof enValue === 'string' && enValue.length > 3 && enValue === filValue;
    });
    // A few brand strings (Sweet Gonz, product-ish labels) may legitimately match.
    expect(identical.length).toBeLessThan(10);
  });

  it('locale fallback: unknown keys resolve from English (default locale)', () => {
    expect(i18n.t('errors.PRODUCT_UNAVAILABLE')).toBeTruthy();
    // A missing key falls back to the key itself rather than crashing.
    const missing = i18n.t('does.not.exist');
    expect(typeof missing).toBe('string');
    expect(missing).toBe('does.not.exist');
  });

  it('covers every stable API error code in both languages', () => {
    const codes = [
      'VALIDATION_ERROR',
      'EMPTY_CART',
      'PRODUCT_NOT_FOUND',
      'PRODUCT_UNAVAILABLE',
      'ADDON_NOT_FOUND',
      'ADDON_INCOMPATIBLE',
      'OPTION_NOT_FOUND',
      'REQUIRED_OPTIONS',
      'OPTION_LIMIT',
      'QUANTITY_OUT_OF_RANGE',
      'IDEMPOTENCY_KEY_MISSING',
      'ORDER_NOT_FOUND',
      'INVALID_RECEIPT_TOKEN',
      'UNAUTHORIZED',
      'INVALID_CREDENTIALS',
      'RATE_LIMITED',
      'SESSION_EXPIRED',
      'CSRF_INVALID',
      'STALE_VERSION',
      'INVALID_TRANSITION',
      'INVALID_PAYMENT_STATE',
      'PREPARING_PAYMENT_REQUIRED',
      'PAYMENT_NOT_CONFIRMED',
      'NOT_FOUND',
      'INTERNAL_ERROR',
      'NETWORK_ERROR',
      'GENERIC',
    ];
    for (const code of codes) {
      expect(en.errors[code], `en.errors.${code}`).toBeTruthy();
      expect(fil.errors[code], `fil.errors.${code}`).toBeTruthy();
    }
  });
});
