import { useServerStatus } from '../hooks/useServerStatus.js';

export function StandbyScreen() {
  const { online, checking, lastCheckedAt, retry } = useServerStatus({ intervalMs: 60_000 });
  return (
    <section className="admin-page standby-page" aria-labelledby="standby-title">
      <div className="admin-page-heading">
        <div>
          <p className="eyebrow">Cloud fallback</p>
          <h1 id="standby-title">Cloud standby monitor</h1>
          <p className="muted">Keep this page open on one spare device during the demo.</p>
        </div>
        <span className={`status-pill ${online ? 'status-pill--success' : 'status-pill--danger'}`}>
          <span aria-hidden="true">●</span> {online ? 'API ready' : 'API unavailable'}
        </span>
      </div>
      <div className="standby-card">
        <div>
          <p className="eyebrow">Render + Supabase</p>
          <h2>
            {checking
              ? 'Checking connection…'
              : online
                ? 'Fallback is warm'
                : 'Waiting for fallback'}
          </h2>
          <p className="muted">
            The monitor only checks the health endpoint. It does not load orders or expose customer
            data.
          </p>
          {lastCheckedAt && (
            <p className="standby-time">
              Last checked {new Date(lastCheckedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
        <button type="button" className="primary-button" onClick={retry} disabled={checking}>
          {checking ? 'Checking…' : 'Check now'}
        </button>
      </div>
    </section>
  );
}
