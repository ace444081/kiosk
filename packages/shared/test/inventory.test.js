import { describe, expect, it } from 'vitest';
import { getStockStatus, LOW_STOCK_THRESHOLD } from '../src/constants.js';

describe('getStockStatus', () => {
  it('keeps untracked, healthy, low, and sold-out states distinct', () => {
    expect(getStockStatus(null)).toBe('untracked');
    expect(getStockStatus(LOW_STOCK_THRESHOLD + 1)).toBe('healthy');
    expect(getStockStatus(LOW_STOCK_THRESHOLD)).toBe('low');
    expect(getStockStatus(0)).toBe('sold_out');
  });
});
