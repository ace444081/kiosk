import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { useAdminLive } from '../hooks/useAdminLive.js';
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

function orderPriority(order) {
  if (order.status === 'placed' && order.paymentStatus === 'pending_cash') return 0;
  if (order.status === 'preparing') return 1;
  if (order.status === 'ready') return 2;
  if (order.status === 'placed') return 3;
  if (order.status === 'completed') return 4;
  return 5;
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { summary, orders, connection, error, refresh } = useAdminLive({ fetchOrders: true });
  const activeOrders = orders?.filter(
    (order) => !['completed', 'cancelled'].includes(order.status),
  );
  const liveNow = useOrderClock(activeOrders?.some(isOrderTimerActive));

  const openOrder = (event, orderId) => {
    if (event.target.closest('a, button, input, select, textarea, label')) return;
    navigate(`/admin/orders/${orderId}`);
  };

  const openOrderWithKeyboard = (event, orderId) => {
    if (event.target.closest('a, button, input, select, textarea, label')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(`/admin/orders/${orderId}`);
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

  if (!summary) {
    return (
      <div className="empty-state">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  const stats = [
    { label: t('admin.totalOrders'), value: summary.totalOrders },
    { label: t('admin.pendingCash'), value: summary.pendingCash },
    { label: t('admin.preparing'), value: summary.preparing },
    { label: t('admin.ready'), value: summary.ready },
  ];
  const recentCompleted = orders?.filter((order) => order.status === 'completed').slice(0, 3) || [];
  const visibleOrders = [...(activeOrders || []), ...recentCompleted]
    .sort(
      (a, b) =>
        orderPriority(a) - orderPriority(b) || new Date(b.createdAt) - new Date(a.createdAt),
    )
    .slice(0, 10);

  return (
    <div className="admin-dashboard">
      <header className="dashboard-page-heading">
        <div>
          <p className="dashboard-kicker">{t('admin.today')}</p>
          <h1>{t('admin.summary')}</h1>
          <p className="dashboard-date">{summary.businessDate}</p>
        </div>
        <ConnectionPill connection={connection} />
      </header>

      <section className="dashboard-overview" aria-label={t('admin.summary')}>
        <div className="stat-card dashboard-sales-card">
          <div className="stat-label">{t('admin.completedSales')}</div>
          <div className="stat-value">{formatPeso(summary.completedSalesCentavos)}</div>
          <div className="dashboard-sales-breakdown">
            <div>
              <span>{t('admin.completedSalesCash')}</span>
              <strong>{formatPeso(summary.completedSalesCashCentavos)}</strong>
            </div>
            <div>
              <span>{t('admin.completedSalesDemo')}</span>
              <strong>{formatPeso(summary.completedSalesDemoCentavos)}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-kpi-grid">
          {stats.map((stat) => (
            <div className="stat-card dashboard-kpi-card" key={stat.label}>
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-status-summary" aria-label={t('admin.status')}>
        <span>
          <strong>{summary.placed}</strong> {t('admin.placed')}
        </span>
        <span>
          <strong>{summary.completed}</strong> {t('admin.completed')}
        </span>
        <span>
          <strong>{summary.cancelled}</strong> {t('admin.cancelled')}
        </span>
      </div>

      <div className="simulated-note">{t('admin.simulatedNote')}</div>

      <section className="dashboard-section dashboard-queue-section">
        <div className="dashboard-section-heading">
          <div>
            <h2>{t('admin.orders')}</h2>
            <p>{t('admin.queueIntro')}</p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => refresh()}>
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
                  onClick={(event) => openOrder(event, order.id)}
                  onKeyDown={(event) => openOrderWithKeyboard(event, order.id)}
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
    </div>
  );
}
