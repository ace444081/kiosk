import { describe, expect, it } from 'vitest';
import { presetRange } from '../utils/date-range.js';

describe('admin analytics date presets', () => {
  it('supports one day, rolling windows, month, year, and custom fallback', () => {
    expect(presetRange('last1', '2026-09-11')).toEqual({ from: '2026-09-11', to: '2026-09-11' });
    expect(presetRange('last7', '2026-09-11')).toEqual({ from: '2026-09-05', to: '2026-09-11' });
    expect(presetRange('last30', '2026-09-11')).toEqual({ from: '2026-08-13', to: '2026-09-11' });
    expect(presetRange('month', '2026-09-11')).toEqual({ from: '2026-09-01', to: '2026-09-11' });
    expect(presetRange('year', '2026-09-11')).toEqual({ from: '2026-01-01', to: '2026-09-11' });
  });
});
