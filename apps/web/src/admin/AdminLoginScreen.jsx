import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../services/api.js';
import { adminLogin } from '../services/admin-api.js';

export function AdminLoginScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await adminLogin(username, password);
      navigate(session.role === 'admin' ? '/admin' : `/staff/${session.role}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setRateLimitSeconds(err.retryAfterSeconds || 60);
        setError('admin.loginRateLimited');
      } else {
        setError('admin.loginError');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login-screen">
      <form className="card admin-login-card" onSubmit={submit} noValidate>
        <img src="/placeholders/logo.svg" alt={t('common.appName')} width="180" height="112" />
        <h1>{t('admin.loginTitle')}</h1>

        <div className="form-field">
          <label htmlFor="admin-username">{t('admin.username')}</label>
          <input
            id="admin-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="admin-password">{t('admin.password')}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error === 'admin.loginRateLimited'
              ? t('admin.loginRateLimited', { seconds: rateLimitSeconds })
              : t(error)}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={busy || !username || !password}
          style={{ width: '100%' }}
        >
          {busy ? t('common.loading') : t('admin.login')}
        </button>
      </form>
    </main>
  );
}
