import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';

export { aggregateTrend, rangeLength, trendGranularity } from './analytics-trend.js';

const LazyAnalyticsTrendChart = lazy(() =>
  import('./AnalyticsTrendChart.jsx').then((module) => ({ default: module.AnalyticsTrendChart })),
);

export function AnalyticsTrendChart(props) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <section className="analytics-trend-panel analytics-trend-panel-loading" aria-busy="true">
          <div className="analytics-chart-heading">
            <h2>{props.title}</h2>
          </div>
          <div className="analytics-chart-skeleton">{t('common.loading')}</div>
        </section>
      }
    >
      <LazyAnalyticsTrendChart {...props} />
    </Suspense>
  );
}

export function AnalyticsRangeControls({
  from,
  to,
  preset,
  onPreset,
  onFrom,
  onTo,
  onRefresh,
  onExport,
  downloading = false,
  invalid = false,
}) {
  const { t } = useTranslation();
  return (
    <div className="analytics-range-controls" aria-label={t('admin.periodControls')}>
      <label>
        <span>{t('admin.period')}</span>
        <select value={preset} onChange={(event) => onPreset(event.target.value)}>
          <option value="last1">{t('admin.rangeLast1')}</option>
          <option value="last7">{t('admin.rangeLast7')}</option>
          <option value="last30">{t('admin.rangeLast30')}</option>
          <option value="month">{t('admin.rangeMonth')}</option>
          <option value="year">{t('admin.rangeYear')}</option>
          <option value="custom">{t('admin.rangeCustom')}</option>
        </select>
      </label>
      <label>
        <span>{t('admin.fromDate')}</span>
        <input type="date" value={from} onChange={(event) => onFrom(event.target.value)} />
      </label>
      <label>
        <span>{t('admin.toDate')}</span>
        <input type="date" value={to} min={from} onChange={(event) => onTo(event.target.value)} />
      </label>
      {onRefresh && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onRefresh}
          disabled={downloading}
        >
          {t('admin.refresh')}
        </button>
      )}
      {onExport && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={invalid || downloading}
          onClick={onExport}
        >
          {downloading ? t('admin.preparingExport') : t('admin.exportOperations')}
        </button>
      )}
    </div>
  );
}
