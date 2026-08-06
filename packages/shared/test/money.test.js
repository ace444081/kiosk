import { describe, expect, it } from 'vitest';
import { formatPeso, formatPesoNoDecimals, sumCentavos, multiplyCentavos } from '../src/money.js';

describe('money helpers (integer centavos)', () => {
  it('formats pesos with two decimals', () => {
    expect(formatPeso(10500)).toBe('₱105.00');
    expect(formatPeso(65)).toBe('₱0.65');
    expect(formatPeso(1234567)).toBe('₱12,345.67');
  });

  it('formats whole pesos without decimals when asked', () => {
    expect(formatPesoNoDecimals(10500)).toBe('₱105');
  });

  it('rejects non-integer input', () => {
    expect(() => formatPeso(105.5)).toThrow(TypeError);
    expect(() => formatPeso('105')).toThrow(TypeError);
  });

  it('multiplies and sums centavo values', () => {
    expect(multiplyCentavos(5500, 3)).toBe(16500);
    expect(sumCentavos([100, 200, 300])).toBe(600);
    expect(sumCentavos([])).toBe(0);
  });
});
