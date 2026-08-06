import { describe, expect, it } from 'vitest';
import {
  computeIdleState,
  secondsUntilReset,
  IDLE_WARN_MS,
  IDLE_RESET_MS,
  IDLE_CONTINUE_GRACE_MS,
} from '@kiosk/shared';

describe('kiosk idle/timeout behavior (pure logic)', () => {
  const t0 = 1_000_000;

  it('is active before the warning threshold', () => {
    expect(computeIdleState(t0, t0 + IDLE_WARN_MS - 1)).toBe('active');
  });

  it('warns exactly at 105 seconds of inactivity', () => {
    expect(computeIdleState(t0, t0 + IDLE_WARN_MS)).toBe('warning');
  });

  it('warns during the 15-second grace period', () => {
    expect(computeIdleState(t0, t0 + IDLE_WARN_MS + IDLE_CONTINUE_GRACE_MS - 1)).toBe('warning');
  });

  it('resets at 120 seconds', () => {
    expect(computeIdleState(t0, t0 + IDLE_RESET_MS)).toBe('reset');
  });

  it('secondsUntilReset counts down correctly', () => {
    expect(secondsUntilReset(t0, t0 + IDLE_WARN_MS)).toBe(15);
    expect(secondsUntilReset(t0, t0 + IDLE_RESET_MS)).toBe(0);
    expect(secondsUntilReset(t0, t0 + IDLE_RESET_MS + 5000)).toBe(0);
  });

  it('exposes the documented thresholds', () => {
    expect(IDLE_WARN_MS).toBe(105_000);
    expect(IDLE_CONTINUE_GRACE_MS).toBe(15_000);
    expect(IDLE_RESET_MS).toBe(120_000);
  });
});
