import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { api } from '../services/api.js';
import { adminDownload } from '../services/admin-api.js';
import { manilaDate, presetRange } from '../utils/date-range.js';
import { AnalyticsRangeControls, AnalyticsTrendChart } from './AnalyticsWidgets.jsx';

function today() {
  return manilaDate();
}

export function buildCashierReportSummary(staffPerformance = []) {
  const totalConfirmations = staffPerformance.reduce(
    (total, staff) => total + Number(staff.cashConfirmedOrders || 0),
    0,
  );
  const totalCollectedCentavos = staffPerformance.reduce(
    (total, staff) => total + Number(staff.cashCollectedCentavos || 0),
    0,
  );
  const activeCashiers = staffPerformance.filter((staff) => staff.active).length;
  const topCashier = [...staffPerformance].sort(
    (left, right) =>
      Number(right.cashCollectedCentavos || 0) - Number(left.cashCollectedCentavos || 0) ||
      left.username.localeCompare(right.username),
  )[0];

  return {
    totalConfirmations,
    totalCollectedCentavos,
    activeCashiers,
    averageCashOrderCentavos: totalConfirmations
      ? Math.round(totalCollectedCentavos / totalConfirmations)
      : null,
    topCashier: topCashier?.cashConfirmedOrders ? topCashier : null,
  };
}

function CashierStatistics({
  staffPerformance = [],
  staffOptions = staffPerformance,
  staffFilter = 'all',
  onStaffFilter,
}) {
  const { t } = useTranslation();
  const options = staffOptions.length ? staffOptions : staffPerformance;
  const visibleStaff =
    staffFilter === 'all'
      ? staffPerformance
      : staffPerformance.filter((staff) => staff.username === staffFilter);
  const summary = buildCashierReportSummary(visibleStaff);
  const maxCollected = Math.max(
    1,
    ...visibleStaff.map((staff) => Number(staff.cashCollectedCentavos || 0)),
  );

  return (
    <section className="report-cashier-panel" aria-labelledby="cashier-statistics-title">
      <div className="report-section-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.staffMonitoring')}</p>
          <h2 id="cashier-statistics-title">{t('admin.cashierStatistics')}</h2>
          <p>{t('admin.cashierStatisticsIntro')}</p>
        </div>
        {onStaffFilter && (
          <label className="report-staff-filter">
            <span>{t('admin.staffFilter')}</span>
            <select value={staffFilter} onChange={(event) => onStaffFilter(event.target.value)}>
              <option value="all">{t('admin.allStaff')}</option>
              {options.map((staff) => (
                <option key={staff.username} value={staff.username}>
                  {staff.username}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="report-cashier-summary-grid">
        <div className="report-cashier-metric">
          <span>{t('admin.cashCollected')}</span>
          <strong>{formatPeso(summary.totalCollectedCentavos)}</strong>
          <small>
            {summary.totalConfirmations} {t('admin.cashConfirmed').toLowerCase()}
          </small>
        </div>
        <div className="report-cashier-metric">
          <span>{t('admin.averageCashOrder')}</span>
          <strong>
            {summary.averageCashOrderCentavos == null
              ? 'N/A'
              : formatPeso(summary.averageCashOrderCentavos)}
          </strong>
          <small>
            {summary.activeCashiers} {t('admin.activeCashiers')}
          </small>
        </div>
        <div className="report-cashier-metric">
          <span>{t('admin.topCashier')}</span>
          <strong>{summary.topCashier?.username || t('admin.noCashierActivity')}</strong>
          <small>
            {summary.topCashier
              ? formatPeso(summary.topCashier.cashCollectedCentavos)
              : t('admin.noCashierActivity')}
          </small>
        </div>
      </div>

      {visibleStaff.length ? (
        <>
          <div
            className="cashier-collection-chart"
            role="img"
            aria-label={t('admin.cashierCollectionChart')}
          >
            {visibleStaff.map((staff) => {
              const collected = Number(staff.cashCollectedCentavos || 0);
              return (
                <div className="cashier-collection-row" key={staff.username}>
                  <div className="cashier-collection-label">
                    <strong>{staff.username}</strong>
                    <span className={`staff-presence ${staff.active ? 'active' : 'inactive'}`}>
                      {staff.active ? t('admin.active') : t('admin.inactive')}
                    </span>
                  </div>
                  <div className="cashier-collection-track" aria-hidden="true">
                    <span style={{ width: `${(collected / maxCollected) * 100}%` }} />
                  </div>
                  <strong className="cashier-collection-value">{formatPeso(collected)}</strong>
                </div>
              );
            })}
          </div>
          <div className="orders-table-wrap report-cashier-table-wrap">
            <table className="orders-table staff-performance-table">
              <thead>
                <tr>
                  <th>{t('admin.staffMember')}</th>
                  <th>{t('admin.cashConfirmed')}</th>
                  <th>{t('admin.cashCollected')}</th>
                  <th>{t('admin.completedCash')}</th>
                  <th>{t('admin.averageCashOrder')}</th>
                  <th>{t('admin.lastCashConfirmation')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((staff) => (
                  <tr key={staff.username}>
                    <td data-label={t('admin.staffMember')}>
                      <strong>{staff.username}</strong>
                      <span className={`staff-presence ${staff.active ? 'active' : 'inactive'}`}>
                        {staff.active ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td data-label={t('admin.cashConfirmed')}>{staff.cashConfirmedOrders}</td>
                    <td data-label={t('admin.cashCollected')}>
                      {formatPeso(staff.cashCollectedCentavos)}
                    </td>
                    <td data-label={t('admin.completedCash')}>
                      {staff.completedCashOrders} · {formatPeso(staff.completedCashCentavos)}
                    </td>
                    <td data-label={t('admin.averageCashOrder')}>
                      {staff.averageCashOrderCentavos == null
                        ? 'N/A'
                        : formatPeso(staff.averageCashOrderCentavos)}
                    </td>
                    <td data-label={t('admin.lastCashConfirmation')}>
                      {staff.lastCashConfirmationAt
                        ? new Date(staff.lastCashConfirmationAt).toLocaleString()
                        : t('admin.noCashierActivity')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="dashboard-empty-panel">{t('admin.noStaffAccounts')}</div>
      )}
    </section>
  );
}

export function AdminReports() {
  const { t } = useTranslation();
  const currentDate = today();
  const initialRange = presetRange('last1', currentDate);
  const [preset, setPreset] = useState('last1');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [staffFilter, setStaffFilter] = useState('all');
  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!from || !to || from > to) return;
    setSummary(null);
    setAnalytics(null);
    try {
      const staffQuery = staffFilter === 'all' ? '' : `&staff=${encodeURIComponent(staffFilter)}`;
      const [reportPayload, analyticsPayload] = await Promise.all([
        api.get(`/admin/reports/summary?from=${from}&to=${to}${staffQuery}`),
        api.get(`/admin/analytics?from=${from}&to=${to}${staffQuery}`),
      ]);
      setSummary(reportPayload.summary);
      setAnalytics(analyticsPayload.analytics);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [from, staffFilter, to]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const staffQuery = staffFilter === 'all' ? '' : `&staff=${encodeURIComponent(staffFilter)}`;
      const result = await adminDownload(
        `/admin/reports/soa.xlsx?from=${from}&to=${to}${staffQuery}`,
      );
      const link = document.createElement('a');
      const url = URL.createObjectURL(result.blob);
      link.href = url;
      link.download = result.filename || `sweet-gonz-operations-${from}-to-${to}.xlsx`;
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

  const handlePreset = (nextPreset) => {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      const range = presetRange(nextPreset, currentDate);
      setFrom(range.from);
      setTo(range.to);
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
      <AnalyticsRangeControls
        from={from}
        to={to}
        preset={preset}
        onPreset={handlePreset}
        onFrom={(value) => {
          setPreset('custom');
          setFrom(value);
        }}
        onTo={(value) => {
          setPreset('custom');
          setTo(value);
        }}
        onRefresh={load}
        onExport={download}
        downloading={downloading}
        invalid={!from || !to || from > to || !summary}
      />
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
      {!summary || !analytics ? (
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
          <AnalyticsTrendChart
            daily={analytics.daily}
            from={from}
            to={to}
            title={t('admin.dailyActivity')}
            description={t('admin.reportTrendHint')}
          />
          <CashierStatistics
            staffPerformance={analytics.staffPerformance || []}
            staffOptions={analytics.availableStaff || []}
            staffFilter={staffFilter}
            onStaffFilter={setStaffFilter}
          />
          <div className="simulated-note">{t('admin.soaDemoNotice')}</div>
          <p className="report-note">{t('admin.anonymousOrderNote')}</p>
        </>
      )}
    </div>
  );
}
