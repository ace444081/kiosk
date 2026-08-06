import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso, ORDER_STATUSES } from '@kiosk/shared';
import { api } from '../services/api.js';
import { useAdminLive } from '../hooks/useAdminLive.js';
import {
  getOrderTimerState,
  isOrderTimerActive,
  OrderTimer,
  useOrderClock,
} from './OrderTimer.jsx';

export function AdminOrders() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { summary, connection, refresh } = useAdminLive({ fetchOrders: false });

  const fetchFiltered = useMemo(
    () => async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (paymentFilter) params.set('payment', paymentFilter);
      if (dateFilter) params.set('date', dateFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      return api.get(`/admin/orders?${params.toString()}`);
    },
    [statusFilter, paymentFilter, dateFilter, debouncedSearch],
  );

  const [filteredOrders, setFilteredOrders] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const liveNow = useOrderClock(filteredOrders?.some(isOrderTimerActive));

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

  useEffect(() => {
    let cancelled = false;
    fetchFiltered()
      .then((payload) => {
        if (!cancelled) {
          setFilteredOrders(payload.orders);
          setFilterError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setFilterError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchFiltered]);

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}
      >
        <h1 style={{ margin: 0 }}>{t('admin.orders')}</h1>
        <span
          className={`conn-pill ${connection === 'live' || connection === 'polling' ? 'online' : 'offline'}`}
        >
          <span className="conn-dot" aria-hidden="true" />
          {connection === 'live'
            ? t('admin.live')
            : connection === 'polling'
              ? t('admin.polling')
              : t('admin.disconnected')}
        </span>
      </div>

      <div className="filters-bar" style={{ marginTop: 'var(--space-4)' }}>
        <label htmlFor="order-search" className="sr-only">
          {t('admin.searchOrders')}
        </label>
        <input
          id="order-search"
          type="search"
          placeholder={t('admin.searchOrders')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label htmlFor="order-status-filter" className="sr-only">
          {t('admin.filterStatus')}
        </label>
        <select
          id="order-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('admin.allStatuses')}</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`statuses.${status}`)}
            </option>
          ))}
        </select>
        <label htmlFor="order-payment-filter" className="sr-only">
          {t('admin.filterPayment')}
        </label>
        <select
          id="order-payment-filter"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          <option value="">{t('admin.allPayments')}</option>
          <option value="pending_cash">{t('statuses.pending_cash')}</option>
          <option value="cash_received">{t('statuses.cash_received')}</option>
          <option value="demo_confirmed">{t('statuses.demo_confirmed')}</option>
        </select>
        <label htmlFor="order-date-filter" className="sr-only">
          {t('admin.filterDate')}
        </label>
        <input
          id="order-date-filter"
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={() => refresh()}>
          {t('admin.refresh')}
        </button>
      </div>

      {filterError && (
        <div className="alert alert-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
          {t('admin.loadError')}
        </div>
      )}

      <div className="orders-table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>{t('admin.orderNumber')}</th>
              <th>{t('admin.orderTime')}</th>
              <th>{t('admin.paymentStatus')}</th>
              <th>{t('admin.total')}</th>
              <th>{t('admin.status')}</th>
              <th>{t('admin.elapsed')}</th>
            </tr>
          </thead>
          <tbody>
            {!filteredOrders && (
              <tr>
                <td colSpan={6} className="empty-state">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {filteredOrders?.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-state">
                  {t('admin.emptyOrders')}
                </td>
              </tr>
            )}
            {filteredOrders?.map((order) => (
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
                <td data-label={t('admin.paymentStatus')}>
                  <span className={`badge badge-${order.paymentStatus}`}>
                    {t(`statuses.${order.paymentStatus}`)}
                  </span>
                </td>
                <td data-label={t('admin.total')}>{formatPeso(order.totalCentavos)}</td>
                <td data-label={t('admin.status')}>
                  <span className={`badge badge-${order.status}`}>
                    {t(`statuses.${order.status}`)}
                  </span>
                </td>
                <td data-label={t('admin.elapsed')}>
                  <OrderTimer order={order} now={liveNow} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary && (
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-3)' }}>
          {t('admin.summary')}: {summary.totalOrders} {t('admin.totalOrders')} ·{' '}
          {summary.pendingCash} {t('admin.pendingCash')}
        </p>
      )}
    </div>
  );
}
