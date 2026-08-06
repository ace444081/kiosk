import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api.js';

function describeAction(action) {
  return action.toLowerCase().replaceAll('_', ' ');
}

function formatDate(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdminActivity() {
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const payload = await api.get(`/admin/audit-events?${params.toString()}`);
      setEvents(payload.events);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>{t('admin.activity')}</h1>
          <p>{t('admin.activityIntro')}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={load}>
          {t('admin.refresh')}
        </button>
      </div>
      <div className="filters-bar">
        <label>
          {t('admin.fromDate')}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          {t('admin.toDate')}
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>
      {error && (
        <div className="alert alert-danger" role="alert">
          {error.message || t('admin.loadError')}
        </div>
      )}
      <div className="orders-table-wrap activity-table-wrap">
        <table className="orders-table activity-table">
          <thead>
            <tr>
              <th>{t('admin.timestamp')}</th>
              <th>{t('admin.actor')}</th>
              <th>{t('admin.activityAction')}</th>
              <th>{t('admin.target')}</th>
              <th>{t('admin.change')}</th>
            </tr>
          </thead>
          <tbody>
            {!events && (
              <tr>
                <td colSpan="5" className="empty-state">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {events?.length === 0 && (
              <tr>
                <td colSpan="5" className="empty-state">
                  {t('admin.noActivity')}
                </td>
              </tr>
            )}
            {events?.map((event) => (
              <tr key={event.id}>
                <td data-label={t('admin.timestamp')}>
                  {formatDate(event.createdAt, i18n.language)}
                </td>
                <td data-label={t('admin.actor')}>{event.actor || '—'}</td>
                <td data-label={t('admin.activityAction')}>
                  <span className="activity-action">{describeAction(event.action)}</span>
                </td>
                <td data-label={t('admin.target')}>
                  {event.targetType ? `${event.targetType}: ${event.targetId || '—'}` : '—'}
                </td>
                <td data-label={t('admin.change')}>
                  <details>
                    <summary>{t('admin.viewChange')}</summary>
                    <pre>
                      {JSON.stringify(
                        { before: event.previousState, after: event.newState },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
