import { useCallback, useEffect, useRef, useState } from 'react';
import { IDLE_WARN_MS, IDLE_RESET_MS, IDLE_CONTINUE_GRACE_MS } from '@kiosk/shared';

/**
 * Kiosk inactivity handling:
 *  - warn after IDLE_WARN_MS (105s), giving IDLE_CONTINUE_GRACE_MS (15s)
 *  - reset after IDLE_RESET_MS (120s)
 *  - never resets while `isProtected` (order submission in flight)
 *  - any activity (pointer/key/touch) resets the clock and dismisses the warning
 *
 * Returns { state: 'active'|'warning'|'reset', secondsLeft, continueSession }.
 */
export function useIdleTimer({ enabled = true, isProtected = false, onReset } = {}) {
  const [state, setState] = useState('active');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const protectedRef = useRef(isProtected);
  protectedRef.current = isProtected;

  const bump = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState((s) => (s === 'warning' ? 'active' : s));
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel'];
    const handler = () => bump();
    for (const event of events) window.addEventListener(event, handler, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, handler);
    };
  }, [enabled, bump]);

  useEffect(() => {
    if (!enabled) return undefined;
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;
      if (protectedRef.current) {
        // Do not reset while an order submission is pending.
        lastActivityRef.current = now;
        setState('active');
        return;
      }
      if (elapsed >= IDLE_RESET_MS) {
        setState('reset');
        onReset?.();
        return;
      }
      if (elapsed >= IDLE_WARN_MS) {
        setState('warning');
        const left = Math.max(0, Math.ceil((IDLE_RESET_MS - elapsed) / 1000));
        setSecondsLeft(left);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [enabled, onReset]);

  const continueSession = useCallback(() => {
    lastActivityRef.current = Date.now();
    setState('active');
  }, []);

  return { state, secondsLeft, continueSession, bump };
}

export { IDLE_WARN_MS, IDLE_RESET_MS, IDLE_CONTINUE_GRACE_MS };
