import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchStaffSession, staffLogout } from '../services/admin-api.js';

export function StaffShell() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    fetchStaffSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setReady(true));
  }, []);
  if (!ready)
    return (
      <main className="station-loading">
        <div className="ticket-skeleton" />
        <p>Opening station…</p>
      </main>
    );
  if (!session) return <Navigate to="/staff/login" replace />;
  const station = location.pathname.split('/')[2] || '';
  if (session.role !== 'admin' && station && session.role !== station) {
    return <Navigate to={`/staff/${session.role}`} replace />;
  }
  const logout = async () => {
    await staffLogout();
    navigate('/staff/login', { replace: true });
  };
  return <Outlet context={{ session, logout }} />;
}

export function StaffLauncher() {
  const stations = [
    ['cashier', 'Cashier', 'Confirm cash before the order reaches the kitchen.'],
    ['kitchen', 'Kitchen', 'Prepare paid orders and send them to the serving counter.'],
    ['serving', 'Serving', 'Verify ready orders and complete the customer handoff.'],
  ];
  return (
    <main className="staff-launcher">
      <img src="/placeholders/logo.svg" alt="Sweet Gonz" />
      <p className="station-eyebrow">Station launcher</p>
      <h1>Choose an operations view</h1>
      <div>
        {stations.map(([key, title, text]) => (
          <a key={key} href={`/staff/${key}`}>
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
