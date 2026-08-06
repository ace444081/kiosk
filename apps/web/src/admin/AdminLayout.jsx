import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ADMIN_LOCALE_STORAGE_KEY } from '@kiosk/shared';
import { ApiError } from '../services/api.js';
import { adminLogout, fetchAdminSession } from '../services/admin-api.js';

export function AdminLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState(null);

  // Admin console language preference (separate from the kiosk locale).
  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === 'fil' || stored === 'en') i18n.changeLanguage(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await fetchAdminSession();
        if (!cancelled) {
          if (payload.role !== 'admin') {
            navigate(`/staff/${payload.role}`, { replace: true });
            return;
          }
          setUser(payload.username);
          setChecking(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            navigate('/admin/login', { replace: true });
          } else {
            setChecking(false);
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const setAdminLocale = (locale) => {
    i18n.changeLanguage(locale);
    try {
      localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore
    }
  };

  const logout = async () => {
    await adminLogout();
    navigate('/admin/login', { replace: true });
  };

  if (checking) {
    return (
      <div className="admin-shell">
        <div className="empty-state">
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Session check failed for a non-auth reason (e.g. server down).
    return (
      <div className="admin-shell">
        <div className="empty-state" role="alert">
          <h2>{t('admin.sessionExpired')}</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {t('admin.refresh')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="admin-brand">
          <img src="/placeholders/logo.svg" alt="" width="64" height="40" />
          <span>{t('admin.title')}</span>
        </div>
        <div className="admin-spacer" />
        <div className="admin-topbar-actions">
          <div
            className="header-lang language-selector"
            role="group"
            aria-label={t('admin.changeLanguage')}
          >
            <button
              type="button"
              className={`lang-btn ${i18n.language === 'en' ? 'active' : ''}`}
              aria-pressed={i18n.language === 'en'}
              onClick={() => setAdminLocale('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-btn ${i18n.language === 'fil' ? 'active' : ''}`}
              aria-pressed={i18n.language === 'fil'}
              onClick={() => setAdminLocale('fil')}
            >
              FIL
            </button>
          </div>
          <span className="admin-user">{user}</span>
          <button type="button" className="btn btn-ghost admin-logout" onClick={logout}>
            {t('admin.logout')}
          </button>
        </div>
      </header>
      <div className="admin-workspace">
        <nav className="admin-nav" aria-label={t('admin.adminTitle')}>
          <NavLink to="/admin" end className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('admin.dashboard')}
          </NavLink>
          <NavLink to="/admin/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('admin.orders')}
          </NavLink>
          <NavLink to="/admin/menu" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('admin.menu')}
          </NavLink>
          <NavLink to="/admin/activity" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('admin.activity')}
          </NavLink>
          <NavLink to="/admin/reports" className={({ isActive }) => (isActive ? 'active' : '')}>
            {t('admin.reports')}
          </NavLink>
          <NavLink to="/staff" className={({ isActive }) => (isActive ? 'active' : '')}>
            Stations
          </NavLink>
        </nav>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
