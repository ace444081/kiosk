import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { api } from '../services/api.js';
import { adminDownload } from '../services/admin-api.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AdminReports() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    try {
      const payload = await api.get(`/admin/reports/summary?from=${from}&to=${to}`);
      setSummary(payload.summary);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const result = await adminDownload(`/admin/reports/soa.xlsx?from=${from}&to=${to}`);
      const link = document.createElement('a');
      const url = URL.createObjectURL(result.blob);
      link.href = url;
      link.download = result.filename || `sweet-gonz-soa-${from}-to-${to}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>{t('admin.reports')}</h1>
          <p>{t('admin.reportsIntro')}</p>
        </div>
      </div>
      <section className="report-controls">
        <label>
          {t('admin.fromDate')}
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          {t('admin.toDate')}
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button type="button" className="btn btn-secondary" onClick={load}>
          {t('admin.refresh')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!summary || downloading || from > to}
          onClick={download}
        >
          {downloading ? t('admin.preparingExport') : t('admin.downloadSoa')}
        </button>
      </section>
      {from > to && (
        <div className="alert alert-danger" role="alert">
          {t('admin.invalidDateRange')}
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error.message || t('admin.loadError')}
        </div>
      )}
      {!summary ? (
        <div className="empty-state">
          <p>{t('common.loading')}</p>
        </div>
      ) : (
        <>
          <div className="report-summary-grid">
            <div className="stat-card">
              <div className="stat-label">{t('admin.cashReceived')}</div>
              <div className="stat-value">{formatPeso(summary.completedCashCentavos)}</div>
              <div className="stat-note">
                {summary.completedCashOrderCount} {t('admin.completedOrders')}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('admin.pendingCashValue')}</div>
              <div className="stat-value">{formatPeso(summary.pendingCashCentavos)}</div>
              <div className="stat-note">
                {summary.pendingCashOrderCount} {t('admin.pendingCash')}
              </div>
            </div>
            <div className="stat-card simulated-stat">
              <div className="stat-label">{t('admin.demoWalletSimulated')}</div>
              <div className="stat-value">{formatPeso(summary.completedDemoCentavos)}</div>
              <div className="stat-note">
                {summary.completedDemoOrderCount} {t('admin.completedOrders')}
              </div>
            </div>
          </div>
          <div className="simulated-note">{t('admin.soaDemoNotice')}</div>
          <p className="report-note">{t('admin.anonymousOrderNote')}</p>
        </>
      )}
    </div>
  );
}
