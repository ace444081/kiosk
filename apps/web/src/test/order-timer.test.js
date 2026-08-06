import { describe, expect, it } from 'vitest';
import { getOrderTimerState, timerThresholds } from '../admin/OrderTimer.jsx';

const base = {
  status: 'preparing',
  itemCount: 1,
  preparingAt: '2026-08-06T00:00:00.000Z',
};

describe('order timer thresholds', () => {
  it('keeps one item white, yellow, red, then overdue', () => {
    const start = Date.parse(base.preparingAt);
    expect(getOrderTimerState(base, start + 59_999).phase).toBe('on-time');
    expect(getOrderTimerState(base, start + 60_000).phase).toBe('attention');
    expect(getOrderTimerState(base, start + 180_000).phase).toBe('red');
    expect(getOrderTimerState(base, start + 300_000).phase).toBe('overdue');
  });

  it('adds one minute to the yellow and two minutes to the overdue boundary per extra item', () => {
    const thresholds = timerThresholds(2);
    expect(thresholds.redAt).toBe(4 * 60 * 1000);
    expect(thresholds.overdueAt).toBe(7 * 60 * 1000);
  });

  it('does not start before preparing', () => {
    expect(
      getOrderTimerState({ ...base, status: 'placed' }, Date.parse(base.preparingAt) + 600_000)
        .phase,
    ).toBe('idle');
  });

  it('freezes at completion instead of continuing to age', () => {
    const completedAt = '2026-08-06T00:02:30.000Z';
    const state = getOrderTimerState(
      { ...base, status: 'completed', completedAt },
      Date.parse('2026-08-06T00:30:00.000Z'),
    );
    expect(state.phase).toBe('completed');
    expect(state.elapsedSeconds).toBe(150);
  });
});
