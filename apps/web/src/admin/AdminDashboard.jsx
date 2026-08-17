import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { adminDownload } from '../services/admin-api.js';
import { useAdminLive } from '../hooks/useAdminLive.js';
import { formatBusinessDate, manilaDate, presetRange } from '../utils/date-range.js';
import {
  getOrderTimerState,
  isOrderTimerActive,
  OrderTimer,
  useOrderClock,
} from './OrderTimer.jsx';

function ConnectionPill({ connection }) {
  const { t } = useTranslation();
  const online = connection === 'live' || connection === 'polling';
  return (
    <span className={`conn-pill ${online ? 'online' : 'offline'}`}>
      <span className="conn-dot" aria-hidden="true" />
      {connection === 'live'
        ? t('admin.live')
        : connection === 'polling'
          ? t('admin.polling')
          : t('admin.disconnected')}
    </span>
  );
}

function MetricCard({ label, value, note, tone = '' }) {
  return (
    <div className={`stat-card dashboard-metric-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  );
}

function formatMinutes(value) {
  return value == null ? 'N/A' : `${Number(value).toFixed(1)} min`;
}

function orderPriority(order) {
  if (order.status === 'placed' && order.paymentStatus === 'pending_cash') return 0;
  if (order.status === 'preparing') return 1;
  if (order.status === 'ready') return 2;
  if (order.status === 'placed') return 3;
  if (order.status === 'completed') return 4;
  return 5;
}

function PeriodControls({
  from,
  to,
  preset,
  onPreset,
  onFrom,
  onTo,
  onExport,
  downloading,
  invalid,
}) {
  const { t } = useTranslation();
  return (
    <div className="dashboard-controls" aria-label={t('admin.periodControls')}>
      <label>
        <span>{t('admin.period')}</span>
        <select value={preset} onChange={(event) => onPreset(event.target.value)}>
          <option value="today">{t('admin.rangeToday')}</option>
          <option value="yesterday">{t('admin.rangeYesterday')}</option>
          <option value="last7">{t('admin.rangeLast7')}</option>
          <option value="last30">{t('admin.rangeLast30')}</option>
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
      <button
        type="button"
        className="btn btn-primary dashboard-export-button"
        disabled={invalid || downloading}
        onClick={onExport}
      >
        {downloading ? t('admin.preparingExport') : t('admin.exportOperations')}
      </button>
    </div>
  );
}

function DailyTrend({ daily }) {
  const { t } = useTranslation();
  const visible = daily.slice(-14);
  const maxValue = Math.max(
    1,
    ...visible.map((day) => Math.max(day.realCashCentavos, day.demoCentavos)),
  );
  return (
    <section className="dashboard-panel dashboard-trend-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.movement')}</p>
          <h2>{t('admin.dailyActivity')}</h2>
        </div>
        <span className="dashboard-legend">
          <span className="legend-swatch legend-swatch-cash" /> {t('admin.cashReceived')}
          <span className="legend-swatch legend-swatch-demo" /> {t('admin.demoWalletSimulated')}
        </span>
      </div>
      {visible.some((day) => day.orders > 0) ? (
        <div className="dashboard-trend-chart" role="img" aria-label={t('admin.dailyActivity')}>
          {visible.map((day) => (
            <div className="dashboard-trend-column" key={day.businessDate}>
              <div className="dashboard-trend-bars">
                <span
                  className="dashboard-trend-bar dashboard-trend-bar-cash"
                  style={{ height: `${Math.max(3, (day.realCashCentavos / maxValue) * 100)}%` }}
                  title={`${formatBusinessDate(day.businessDate)} cash ${formatPeso(day.realCashCentavos)}`}
                />
                <span
                  className="dashboard-trend-bar dashboard-trend-bar-demo"
                  style={{ height: `${Math.max(3, (day.demoCentavos / maxValue) * 100)}%` }}
                  title={`${formatBusinessDate(day.businessDate)} demo ${formatPeso(day.demoCentavos)}`}
                />
              </div>
              <strong>{day.orders}</strong>
              <span>{day.businessDate.slice(5)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty-panel">{t('admin.noPeriodOrders')}</div>
      )}
    </section>
  );
}

function StatusBreakdown({ statusBreakdown }) {
  const { t } = useTranslation();
  const maxCount = Math.max(1, ...statusBreakdown.map((item) => item.count));
  return (
    <section className="dashboard-panel dashboard-breakdown-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.status')}</p>
          <h2>{t('admin.workflowMix')}</h2>
        </div>
      </div>
      <div className="dashboard-status-list">
        {statusBreakdown.map((item) => (
          <div className="dashboard-status-row" key={item.status}>
            <span>{t(`statuses.${item.status}`)}</span>
            <div className="dashboard-status-track" aria-hidden="true">
              <span style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AttentionPanel({ orders, liveNow }) {
  const { t } = useTranslation();
  const attention = orders.filter((order) => {
    if (['completed', 'cancelled'].includes(order.status)) return false;
    const phase = getOrderTimerState(order, liveNow).phase;
    return (
      ['attention', 'red', 'overdue'].includes(phase) || order.paymentStatus === 'pending_cash'
    );
  });
  return (
    <section className="dashboard-panel dashboard-attention-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.attention')}</p>
          <h2>{t('admin.needsAttention')}</h2>
        </div>
        <span className={`attention-count ${attention.length ? 'has-attention' : ''}`}>
          {attention.length}
        </span>
      </div>
      {attention.length ? (
        <div className="attention-list">
          {attention.slice(0, 5).map((order) => (
            <div className="attention-item" key={order.id}>
              <div>
                <strong>{order.orderNumber}</strong>
                <span>
                  {order.paymentStatus === 'pending_cash'
                    ? t('admin.pendingCash')
                    : t(`statuses.${order.status}`)}
                </span>
              </div>
              <OrderTimer order={order} now={liveNow} />
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty-panel">{t('admin.noAttention')}</div>
      )}
    </section>
  );
}

function TopProducts({ products }) {
  const { t } = useTranslation();
  return (
    <section className="dashboard-panel dashboard-products-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.mix')}</p>
          <h2>{t('admin.topProducts')}</h2>
        </div>
      </div>
      {products.length ? (
        <div className="dashboard-product-list">
          {products.slice(0, 5).map((product, index) => (
            <div className="dashboard-product-row" key={product.sku}>
              <span className="product-rank">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{product.name}</strong>
                <span>
                  {product.units} {t('admin.unitsSold')}
                </span>
              </div>
              <b>{formatPeso(product.grossCentavos)}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty-panel">{t('admin.noPeriodOrders')}</div>
      )}
    </section>
  );
}

function ServiceTimes({ serviceTimes }) {
  const { t } = useTranslation();
  return (
    <section className="dashboard-panel dashboard-service-panel">
      <div className="dashboard-panel-heading">
        <div>
          <p className="dashboard-section-kicker">{t('admin.quality')}</p>
          <h2>{t('admin.serviceTimes')}</h2>
        </div>
        <span className="dashboard-panel-note">
          {serviceTimes.sampleCount} {t('admin.completedOrders')}
        </span>
      </div>
      <div className="dashboard-service-grid">
        <div>
          <span>{t('admin.paymentWait')}</span>
          <strong>{formatMinutes(serviceTimes.paymentWaitMinutes)}</strong>
        </div>
        <div>
          <span>{t('admin.prepTime')}</span>
          <strong>{formatMinutes(serviceTimes.prepMinutes)}</strong>
        </div>
        <div>
          <span>{t('admin.handoffTime')}</span>
          <strong>{formatMinutes(serviceTimes.handoffMinutes)}</strong>
        </div>
        <div>
          <span>{t('admin.totalTime')}</span>
          <strong>{formatMinutes(serviceTimes.totalMinutes)}</strong>
        </div>
      </div>
    </section>
  );
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = manilaDate();
  const initialRange = presetRange('today', today);
  const [preset, setPreset] = useState('today');
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [downloading, setDownloading] = useState(false);
  const invalidRange = !from || !to || from > to;
  const queryFrom = invalidRange ? today : from;
  const queryTo = invalidRange ? today : to;
  const { summary, analytics, orders, connection, error, refresh } = useAdminLive({
    fetchOrders: true,
    rangeFrom: queryFrom,
    rangeTo: queryTo,
  });
  const activeOrders = useMemo(
    () => orders?.filter((order) => !['completed', 'cancelled'].includes(order.status)) || [],
    [orders],
  );
  const liveNow = useOrderClock(activeOrders.some(isOrderTimerActive));

  const visibleOrders = useMemo(() => {
    const recentCompleted = (orders || [])
      .filter((order) => order.status === 'completed')
      .slice(0, 3);
    return [...activeOrders, ...recentCompleted]
      .sort(
        (a, b) =>
          orderPriority(a) - orderPriority(b) || new Date(b.createdAt) - new Date(a.createdAt),
      )
      .slice(0, 10);
  }, [activeOrders, orders]);

  const handlePreset = (nextPreset) => {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') {
      const range = presetRange(nextPreset, today);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const download = async () => {
    if (invalidRange) return;
    setDownloading(true);
    try {
      const result = await adminDownload(`/admin/reports/soa.xlsx?from=${from}&to=${to}`);
      const link = document.createElement('a');
      const url = URL.createObjectURL(result.blob);
      link.href = url;
      link.download = result.filename || `sweet-gonz-operations-${from}-to-${to}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  if (error && !summary) {
    return (
      <div className="empty-state" role="alert">
        <h2>{t('admin.loadError')}</h2>
        <button type="button" className="btn btn-primary" onClick={refresh}>
          {t('admin.retry')}
        </button>
      </div>
    );
  }
  if (!summary || !analytics)
    return (
      <div className="empty-state">
        <p>{t('common.loading')}</p>
      </div>
    );

  const periodLabel =
    from === to
      ? formatBusinessDate(from)
      : `${formatBusinessDate(from)} to ${formatBusinessDate(to)}`;
  const summaryData = analytics.summary;

  return (
    <div className="admin-dashboard">
      <header className="dashboard-page-heading dashboard-page-heading-expanded">
        <div>
          <p className="dashboard-kicker">{t('admin.operations')}</p>
          <h1>{t('admin.operationsTitle')}</h1>
          <p className="dashboard-date">
            {periodLabel} · {t('admin.businessTimezone')}
          </p>
        </div>
        <div className="dashboard-header-status">
          <ConnectionPill connection={connection} />
          <span className="dashboard-refresh-note">{t('admin.liveQueue')}</span>
        </div>
      </header>

      <PeriodControls
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
        onExport={download}
        downloading={downloading}
        invalid={invalidRange}
      />
      {invalidRange && <div className="alert alert-danger">{t('admin.invalidDateRange')}</div>}

      {!analytics.coverage.hasData && (
        <div className="dashboard-period-empty">
          <strong>{t('admin.noPeriodOrders')}</strong>
          <span>{t('admin.noPeriodOrdersHint')}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handlePreset('last30')}
          >
            {t('admin.viewLast30')}
          </button>
        </div>
      )}

      <section
        className="dashboard-overview dashboard-overview-new"
        aria-label={t('admin.operationsTitle')}
      >
        <MetricCard
          label={t('admin.realCashSales')}
          value={formatPeso(summaryData.completedSalesCashCentavos)}
          note={`${summaryData.completedCashOrderCount} ${t('admin.completedOrders')} | ${t('admin.completedSales')}`}
          tone="dashboard-metric-primary"
        />
        <MetricCard
          label={t('admin.totalOrders')}
          value={summaryData.totalOrders}
          note={t('admin.confirmedOrdersOnly')}
        />
        <MetricCard
          label={t('admin.completedOrders')}
          value={summaryData.completedOrders}
          note={`${Math.round((summaryData.completionRate || 0) * 100)}% ${t('admin.fulfillmentRate')}`}
        />
        <MetricCard
          label={t('admin.averageOrderValue')}
          value={
            summaryData.averageOrderValueCentavos == null
              ? 'N/A'
              : formatPeso(summaryData.averageOrderValueCentavos)
          }
          note={t('admin.confirmedOrdersOnly')}
        />
        <MetricCard
          label={t('admin.pendingCash')}
          value={summaryData.pendingCash}
          note={`${formatPeso(summaryData.pendingCashCentavos)} ${t('admin.pendingCashValue')}`}
          tone={summaryData.pendingCash ? 'dashboard-metric-warning' : ''}
        />
        <MetricCard
          label={t('admin.demoWalletSimulated')}
          value={formatPeso(summaryData.completedSalesDemoCentavos)}
          note={t('admin.simulatedNote')}
          tone="dashboard-metric-demo"
        />
      </section>

      <div className="dashboard-chart-grid">
        <DailyTrend daily={analytics.daily} />
        <StatusBreakdown statusBreakdown={analytics.statusBreakdown} />
      </div>

      <section className="dashboard-live-section">
        <div className="dashboard-section-heading">
          <div>
            <p className="dashboard-section-kicker">{t('admin.liveQueue')}</p>
            <h2>{t('admin.orders')}</h2>
            <p>{t('admin.queueIntro')}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={refresh}>
            {t('admin.refresh')}
          </button>
        </div>
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>{t('admin.orderNumber')}</th>
                <th>{t('admin.orderTime')}</th>
                <th>{t('admin.status')}</th>
                <th>{t('admin.paymentStatus')}</th>
                <th>{t('admin.elapsed')}</th>
                <th>{t('admin.total')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    {t('admin.noOrdersFound')}
                  </td>
                </tr>
              )}
              {visibleOrders.map((order) => (
                <tr
                  key={order.id}
                  className={`order-table-row order-age-${getOrderTimerState(order, liveNow).phase}`}
                  tabIndex={0}
                  aria-label={t('admin.openOrder', { orderNumber: order.orderNumber })}
                  onClick={() => navigate(`/admin/orders/${order.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ')
                      navigate(`/admin/orders/${order.id}`);
                  }}
                >
                  <td data-label={t('admin.orderNumber')}>
                    <span className="order-number-cell">{order.orderNumber}</span>
                  </td>
                  <td data-label={t('admin.orderTime')}>
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td data-label={t('admin.status')}>
                    <span className={`badge badge-${order.status}`}>
                      {t(`statuses.${order.status}`)}
                    </span>
                  </td>
                  <td data-label={t('admin.paymentStatus')}>
                    <span className={`badge badge-${order.paymentStatus}`}>
                      {t(`statuses.${order.paymentStatus}`)}
                    </span>
                  </td>
                  <td data-label={t('admin.elapsed')}>
                    <OrderTimer order={order} now={liveNow} />
                  </td>
                  <td data-label={t('admin.total')}>{formatPeso(order.totalCentavos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-insight-grid">
        <AttentionPanel orders={orders || []} liveNow={liveNow} />
        <TopProducts products={analytics.topProducts} />
        <ServiceTimes serviceTimes={analytics.serviceTimes} />
      </div>
      <div className="simulated-note">{t('admin.simulatedNote')}</div>
    </div>
  );
}
