import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchStaffSession, getStaffStation, staffLogout } from '../services/admin-api.js';

export function StaffShell() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const routeSegment = location.pathname.split('/')[2] || 'launcher';
  const routeStation = ['cashier', 'kitchen', 'serving'].includes(routeSegment)
    ? routeSegment
    : 'launcher';
  const sessionStation = getStaffStation(routeStation);
  useEffect(() => {
    fetchStaffSession(sessionStation)
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, [sessionStation]);
  if (!ready)
    return (
      <main className="station-loading">
        <div className="ticket-skeleton" />
        <p>Opening station…</p>
      </main>
    );
  if (!session) {
    return <Navigate to={`/staff/login?station=${encodeURIComponent(routeStation)}`} replace />;
  }
  if (!['admin', 'staff'].includes(session.role)) {
    return <Navigate to="/staff/login" replace />;
  }
  const logout = async () => {
    await staffLogout(sessionStation);
    navigate('/staff/login', { replace: true });
  };
  return <Outlet context={{ session, logout, sessionStation }} />;
}

export function StaffLauncher() {
  const stations = [
    ['payment', 'Payment', 'Confirm cash before the order reaches preparation.'],
    ['preparation', 'Preparation', 'Prepare paid orders and track the timer.'],
    ['handoff', 'Handoff', 'Complete the customer handoff and close the order.'],
  ];
  return (
    <main className="staff-launcher">
      <img src="/placeholders/logo.svg" alt="Sweet Gonz" />
      <p className="station-eyebrow">One-person operations</p>
      <h1>Open the unified workboard</h1>
      <div>
        {stations.map(([key, title, text]) => (
          <a key={key} href={`/staff/operations?lane=${key}`}>
            <span>
              {String(stations.indexOf(stations.find((s) => s[0] === key)) + 1).padStart(2, '0')}
            </span>
            <strong>{title}</strong>
            <p>{text}</p>
          </a>
        ))}
      </div>
    </main>
  );
}
