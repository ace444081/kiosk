import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_POLL_MS } from '@kiosk/shared';
import { api } from '../services/api.js';

/**
 * Live admin data: SSE with a 5-second polling fallback.
 * Returns { summary, orders, connection, error, refresh, sseActive }.
 */
export function useAdminLive({ fetchOrders = true } = {}) {
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState(null);
  const [connection, setConnection] = useState('connecting'); // connecting | live | polling | offline
  const [error, setError] = useState(null);
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const results = await Promise.all([
        api.get('/admin/summary'),
        fetchOrders ? api.get('/admin/orders') : Promise.resolve(null),
      ]);
      setSummary(results[0].summary);
      if (fetchOrders) setOrders(results[1].orders);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [fetchOrders]);

  refreshRef.current = refresh;

  useEffect(() => {
    refresh();
    let source = null;
    let pollTimer = null;
    let closed = false;

    const startPolling = () => {
      setConnection('polling');
      pollTimer = setInterval(() => refreshRef.current(), ADMIN_POLL_MS);
    };

    try {
      source = new EventSource('/api/v1/admin/events');
      source.onopen = () => {
        setConnection('live');
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      };
      source.onmessage = () => {
        // Backlog/other messages: refresh quietly.
        refreshRef.current();
      };
      source.addEventListener('OrderCreated', () => refreshRef.current());
      source.addEventListener('OrderUpdated', () => refreshRef.current());
      source.addEventListener('AvailabilityChanged', () => refreshRef.current());
      source.onerror = () => {
        // SSE hiccup -> fall back to 5s polling.
        if (!closed) {
          setConnection('polling');
          if (!pollTimer) {
            pollTimer = setInterval(() => refreshRef.current(), ADMIN_POLL_MS);
          }
        }
      };
    } catch {
      startPolling();
    }

    return () => {
      closed = true;
      if (source) source.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [refresh]);

  return { summary, orders, connection, error, refresh };
}
