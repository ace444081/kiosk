import { useEffect, useRef, useState } from 'react';

const HEALTH_INTERVAL_MS = 10_000;

/**
 * Server reachability watcher: polls /api/v1/health every 10s.
 * Returns { online, checking, lastCheckedAt, retry }.
 */
export function useServerStatus({ intervalMs = HEALTH_INTERVAL_MS } = {}) {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const timerRef = useRef(null);

  const check = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/v1/health', {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(4000),
      });
      const body = await res.json().catch(() => null);
      setOnline(res.ok && body?.status === 'ok');
    } catch {
      setOnline(false);
    } finally {
      setChecking(false);
      setLastCheckedAt(Date.now());
    }
  };

  useEffect(() => {
    check();
    timerRef.current = setInterval(check, intervalMs);
    return () => clearInterval(timerRef.current);
  }, [intervalMs]);

  return { online, checking, lastCheckedAt, retry: check };
}
