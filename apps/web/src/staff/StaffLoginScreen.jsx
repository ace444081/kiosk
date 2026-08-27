import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../services/api.js';
import { staffLogin } from '../services/admin-api.js';
import { PasswordField } from '../components/PasswordField.jsx';

const destination = (station) =>
  ['cashier', 'kitchen', 'serving'].includes(station)
    ? `/staff/operations?lane=${station === 'cashier' ? 'payment' : station === 'kitchen' ? 'preparation' : 'handoff'}`
    : '/staff/operations';

export function StaffLoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const station = searchParams.get('station') || 'launcher';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await staffLogin(username, password, station);
      navigate(destination(station), { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Too many attempts. Try again later.'
          : 'Invalid username or password.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="staff-login">
      <section className="staff-login-brand" aria-label="Sweet Gonz staff operations">
        <img src="/placeholders/logo.svg" alt="Sweet Gonz Bakeshop Café" />
        <p>Restaurant operations</p>
        <h1>
          One operator.
          <br />
          One clear workboard.
        </h1>
        <span>Payment · Preparation · Handoff</span>
      </section>
      <form className="staff-login-form" onSubmit={submit}>
        <p className="station-eyebrow">Staff access</p>
        <h2>Sign in to operations</h2>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          Password
          <PasswordField
            id="staff-password"
            label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            showLabel={t('admin.showPassword')}
            hideLabel={t('admin.hidePassword')}
          />
        </label>
        {import.meta.env.DEV && (
          <p className="local-test-hint" role="note">
            <strong>{t('admin.localTesting')}</strong>
            <br />
            {t('admin.localStationCredential')}
          </p>
        )}
        {error && (
          <p className="station-error" role="alert">
            {error}
          </p>
        )}
        <button className="station-primary" disabled={busy || !username || !password}>
          {busy ? 'Signing in…' : 'Open workboard'}
        </button>
        <a href="/admin/login">Administrator console</a>
      </form>
    </main>
  );
}
