import { useCallback, useEffect, useRef, useState } from 'react';
import { ADMIN_POLL_MS } from '@kiosk/shared';
import { staffGet } from '../services/admin-api.js';

const EMPTY_LANES = {
  payment: { orders: [], pagination: { page: 1, pages: 1, total: 0, pageSize: 20 } },
  preparation: { orders: [], pagination: { page: 1, pages: 1, total: 0, pageSize: 20 } },
  handoff: { orders: [], pagination: { page: 1, pages: 1, total: 0, pageSize: 20 } },
};

export function useStaffWorkboard(station = 'launcher', page = 1) {
  const [lanes, setLanes] = useState(EMPTY_LANES);
  const [connection, setConnection] = useState('connecting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const payload = await staffGet(`/staff/workboard?page=${page}`, station);
      setLanes({
        payment: payload.payment || EMPTY_LANES.payment,
        preparation: payload.preparation || EMPTY_LANES.preparation,
        handoff: payload.handoff || EMPTY_LANES.handoff,
      });
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
    const startPolling = () => {
      if (!poll) poll = setInterval(() => refreshRef.current(), ADMIN_POLL_MS);
    };
    try {
      source = new EventSource(`/api/v1/staff/events?station=${encodeURIComponent(station)}`);
      source.onopen = () => {
        setConnection('live');
        if (poll) clearInterval(poll);
        poll = null;
      };
      source.addEventListener('refresh', () => refreshRef.current());
      source.onerror = () => {
        setConnection('polling');
        startPolling();
      };
    } catch {
      setConnection('polling');
      startPolling();
    }
    return () => {
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [refresh, station]);

  return { lanes, connection, loading, error, refresh };
}
