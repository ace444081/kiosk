import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useIdleTimer, IDLE_WARN_MS, IDLE_RESET_MS } from '../hooks/useIdleTimer.js';

function TimerHarness({ onReset, isProtected = false, enabled = true }) {
  const { state, secondsLeft, continueSession } = useIdleTimer({ enabled, isProtected, onReset });
  return (
    <div>
      <span data-testid="state">{state}</span>
      <span data-testid="seconds">{secondsLeft}</span>
      <button type="button" onClick={continueSession}>
        continue
      </button>
    </div>
  );
}

describe('useIdleTimer timeout behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts active', () => {
    render(<TimerHarness />);
    expect(screen.getByTestId('state')).toHaveTextContent('active');
  });

  it('warns after 105 seconds and counts down', async () => {
    render(<TimerHarness />);
    await act(async () => {
      vi.advanceTimersByTime(IDLE_WARN_MS);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('warning');
    expect(screen.getByTestId('seconds')).toHaveTextContent('15');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('seconds')).toHaveTextContent('10');
  });

  it('resets after 120 seconds and fires onReset', async () => {
    const onReset = vi.fn();
    render(<TimerHarness onReset={onReset} />);
    await act(async () => {
      vi.advanceTimersByTime(IDLE_RESET_MS);
    });
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state')).toHaveTextContent('reset');
  });

  it('"continue" dismisses the warning', async () => {
    render(<TimerHarness />);
    await act(async () => {
      vi.advanceTimersByTime(IDLE_WARN_MS + 1000);
    });
    expect(screen.getByTestId('state')).toHaveTextContent('warning');
    fireEvent.click(screen.getByRole('button', { name: 'continue' }));
    expect(screen.getByTestId('state')).toHaveTextContent('active');
  });

  it('does not reset while an order submission is protected', async () => {
    const onReset = vi.fn();
    const { rerender } = render(<TimerHarness isProtected={false} onReset={onReset} />);
    rerender(<TimerHarness isProtected onReset={onReset} />);
    await act(async () => {
      vi.advanceTimersByTime(IDLE_RESET_MS + 60_000);
    });
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByTestId('state')).toHaveTextContent('active');
  });
});
