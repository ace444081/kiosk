import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminPatch, adminPost } from '../services/admin-api.js';
import { api } from '../services/api.js';

const ROLE_OPTIONS = ['admin', 'staff', 'cashier', 'kitchen', 'serving'];

const emptyForm = {
  fullName: '',
  username: '',
  role: 'staff',
  email: '',
  password: '',
  passwordConfirmation: '',
  isActive: true,
};

function formatDate(value, locale, fallback) {
  if (!value) return fallback;
  try {
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function AccountFormDialog({ account, onClose, onSaved }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() =>
    account
      ? {
          ...emptyForm,
          fullName: account.fullName || '',
          username: account.username,
          role: account.role,
          email: account.email || '',
          isActive: account.isActive,
        }
      : emptyForm,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const common = {
        fullName: form.fullName.trim(),
        role: form.role,
        email: form.email.trim() || null,
      };
      const payload = account
        ? await adminPatch(`/admin/accounts/${account.id}`, {
            ...common,
            isActive: form.isActive,
            version: account.version,
          })
        : await adminPost('/admin/accounts', {
            ...common,
            username: form.username.trim(),
            password: form.password,
            passwordConfirmation: form.passwordConfirmation,
          });
      onSaved(payload.account);
    } catch (err) {
      setError(err.message || t('admin.loadError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop admin-form-backdrop" role="presentation">
      <section
        className="admin-account-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
      >
        <div className="admin-dialog-heading">
          <div>
            <p className="admin-eyebrow">{t('admin.accounts')}</p>
            <h2 id="account-dialog-title">
              {account ? t('admin.editAccount') : t('admin.addAccount')}
            </h2>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>
        <form className="admin-account-form" onSubmit={submit}>
          <div className="admin-form-grid">
            <label>
              {t('admin.fullName')}
              <input
                required
                minLength="2"
                maxLength="120"
                value={form.fullName}
                onChange={(event) => update('fullName', event.target.value)}
              />
            </label>
            <label>
              {t('admin.username')}
              <input
                required
                minLength="3"
                maxLength="64"
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                value={form.username}
                disabled={Boolean(account)}
                onChange={(event) => update('username', event.target.value)}
              />
            </label>
            <label>
              {t('admin.role')}
              <select value={form.role} onChange={(event) => update('role', event.target.value)}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {t(`admin.role${role[0].toUpperCase()}${role.slice(1)}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('admin.email')}
              <input
                type="email"
                maxLength="160"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
                placeholder="name@example.com"
              />
            </label>
          </div>
          {!account && (
            <div className="admin-form-grid account-password-grid">
              <label>
                {t('admin.newPassword')}
                <input
                  required
                  type="password"
                  minLength="8"
                  maxLength="128"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update('password', event.target.value)}
                />
              </label>
              <label>
                {t('admin.confirmPassword')}
                <input
                  required
                  type="password"
                  minLength="8"
                  maxLength="128"
                  autoComplete="new-password"
                  value={form.passwordConfirmation}
                  onChange={(event) => update('passwordConfirmation', event.target.value)}
                />
              </label>
              <p className="field-hint admin-form-span">{t('admin.accountPasswordHint')}</p>
            </div>
          )}
          {account && (
            <label className="check-label account-active-toggle">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => update('isActive', event.target.checked)}
              />
              {form.isActive ? t('admin.activeAccount') : t('admin.inactiveAccount')}
            </label>
          )}
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <div className="admin-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy
                ? t('common.loading')
                : account
                  ? t('admin.saveAccount')
                  : t('admin.createAccount')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PasswordResetDialog({ account, onClose, onSaved }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await adminPost(`/admin/accounts/${account.id}/password`, {
        version: account.version,
        password,
        passwordConfirmation,
      });
      onSaved(payload.account);
    } catch (err) {
      setError(err.message || t('admin.loadError'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dialog-backdrop admin-form-backdrop" role="presentation">
      <section
        className="admin-account-dialog admin-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-dialog-title"
      >
        <div className="admin-dialog-heading">
          <div>
            <p className="admin-eyebrow">{t('admin.accounts')}</p>
            <h2 id="password-dialog-title">{t('admin.resetPassword')}</h2>
            <p>{account.fullName || account.username}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>
        <form className="admin-account-form" onSubmit={submit}>
          <label>
            {t('admin.newPassword')}
            <input
              required
              type="password"
              minLength="8"
              maxLength="128"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label>
            {t('admin.confirmPassword')}
            <input
              required
              type="password"
              minLength="8"
              maxLength="128"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
            />
          </label>
          <p className="field-hint">{t('admin.accountPasswordHint')}</p>
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <div className="admin-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('common.loading') : t('admin.resetAccountPassword')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function AdminAccounts() {
  const { t, i18n } = useTranslation();
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [resettingAccount, setResettingAccount] = useState(null);

  const load = useCallback(async () => {
    try {
      const payload = await api.get('/admin/accounts');
      setAccounts(payload.accounts || []);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedAccounts = useMemo(
    () =>
      [...(accounts || [])].sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) ||
          left.fullName.localeCompare(right.fullName),
      ),
    [accounts],
  );

  const mergeAccount = (nextAccount) => {
    setAccounts((previous) =>
      previous?.map((account) => (account.id === nextAccount.id ? nextAccount : account)),
    );
  };

  return (
    <div className="admin-accounts-page">
      <div className="admin-page-heading">
        <div>
          <p className="dashboard-kicker">{t('admin.accounts')}</p>
          <h1>{t('admin.accountsTitle')}</h1>
          <p>{t('admin.accountsIntro')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          {t('admin.addAccount')}
        </button>
      </div>

      {error && (
        <div className="alert alert-warning" role="alert">
          {error.message}
        </div>
      )}

      {!accounts ? (
        <div className="empty-state">
          <p>{t('common.loading')}</p>
        </div>
      ) : sortedAccounts.length === 0 ? (
        <div className="empty-state">
          <p>{t('admin.noAccounts')}</p>
        </div>
      ) : (
        <div className="admin-account-list">
          {sortedAccounts.map((account) => (
            <article
              className={`admin-account-card ${account.isActive ? '' : 'is-inactive'}`}
              key={account.id}
            >
              <div className="admin-account-identity">
                <div className="admin-account-avatar" aria-hidden="true">
                  {(account.fullName || account.username).slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2>{account.fullName || account.username}</h2>
                  <p>@{account.username}</p>
                </div>
              </div>
              <div className="admin-account-details">
                <span className="account-role-badge">
                  {t(`admin.role${account.role[0].toUpperCase()}${account.role.slice(1)}`)}
                </span>
                <span>{account.employeeId || '—'}</span>
                <span>{account.email || '—'}</span>
                <span>
                  {account.isActive ? t('admin.activeAccount') : t('admin.inactiveAccount')}
                </span>
                <span>
                  {t('admin.lastLogin')}:{' '}
                  {formatDate(account.lastLoginAt, i18n.language, t('admin.never'))}
                </span>
              </div>
              <div className="admin-account-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingAccount(account)}
                >
                  {t('admin.editAccount')}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setResettingAccount(account)}
                >
                  {t('admin.resetPassword')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <AccountFormDialog
          onClose={() => setShowForm(false)}
          onSaved={(account) => {
            setAccounts((previous) => [account, ...(previous || [])]);
            setShowForm(false);
          }}
        />
      )}
      {editingAccount && (
        <AccountFormDialog
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={(account) => {
            mergeAccount(account);
            setEditingAccount(null);
          }}
        />
      )}
      {resettingAccount && (
        <PasswordResetDialog
          account={resettingAccount}
          onClose={() => setResettingAccount(null)}
          onSaved={(account) => {
            mergeAccount(account);
            setResettingAccount(null);
          }}
        />
      )}
    </div>
  );
}
