import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_POLL_MS } from '@kiosk/shared';
import { api } from '../services/api.js';

export function useStationQueue(station, page = 1) {
  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [connection, setConnection] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await api.get(`/staff/queue/${station}?page=${page}`);
      setOrders(payload.orders);
      setPagination(payload.pagination);
      setError(null);
      setConnection((value) => (value === 'live' ? 'live' : 'polling'));
    } catch (err) {
      setError(err);
      setConnection('offline');
    } finally {
      setLoading(false);
    }
  }, [page, station]);
  refreshRef.current = refresh;

  useEffect(() => {
    setLoading(true);
    refresh();
    let source;
    let poll;
    const startPoll = () => {
      if (!poll) poll = setInterval(() => refreshRef.current(), ADMIN_POLL_MS);
    };
    try {
      source = new EventSource('/api/v1/staff/events');
      source.onopen = () => {
        setConnection('live');
        if (poll) clearInterval(poll);
        poll = null;
      };
      source.addEventListener('refresh', () => refreshRef.current());
      source.onerror = () => {
        setConnection('polling');
        startPoll();
      };
    } catch {
      setConnection('polling');
      startPoll();
    }
    return () => {
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [refresh]);

  return { orders, pagination, connection, loading, error, refresh };
}
