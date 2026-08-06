import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso, isPaymentConfirmed } from '@kiosk/shared';
import { api } from '../services/api.js';
import { adminPatch } from '../services/admin-api.js';
import { ConfirmDialog } from '../components/KioskBits.jsx';
import { OrderTimer } from './OrderTimer.jsx';

function formatManilaDateTime(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function AdminOrderDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null); // {type, payload}

  const load = useCallback(async () => {
    try {
      const payload = await api.get(`/admin/orders/${id}`);
      setOrder(payload.order);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate = async (path, body) => {
    setBusy(true);
    setConfirm(null);
    try {
      const payload = await adminPatch(path, body);
      setOrder(payload.order);
      setError(null);
    } catch (err) {
      if (
        err.code === 'STALE_VERSION' ||
        err.code === 'INVALID_TRANSITION' ||
        err.code === 'INVALID_PAYMENT_STATE' ||
        err.code === 'PREPARING_PAYMENT_REQUIRED' ||
        err.code === 'PAYMENT_NOT_CONFIRMED'
      ) {
        // Optimistic-concurrency / transition conflict: show newest state
        // plus a specific, localized explanation.
        if (err.order) setOrder(err.order);
        const key = `errors.${err.code}`;
        setError({ code: err.code, message: t(i18n.exists(key) ? key : 'admin.versionConflict') });
      } else {
        setError({ code: err.code, message: t('admin.loadError') });
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !order) {
    return (
      <div className="empty-state" role="alert">
        <h2>{t('admin.loadError')}</h2>
        <Link to="/admin/orders" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          {t('admin.backToOrders')}
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="empty-state">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  const statusActions = [];
  const preparingEnabled = isPaymentConfirmed(order.paymentStatus);
  if (order.status === 'placed') {
    statusActions.push({
      status: 'preparing',
      label: t('admin.markPreparing'),
      disabled: !preparingEnabled,
    });
  }
  if (order.status === 'preparing')
    statusActions.push({ status: 'ready', label: t('admin.markReady') });
  if (order.status === 'ready')
    statusActions.push({ status: 'completed', label: t('admin.markCompleted') });
  if (['placed', 'preparing', 'ready'].includes(order.status)) {
    statusActions.push({ status: 'cancelled', label: t('admin.markCancelled'), danger: true });
  }

  const needsCashConfirmation =
    order.paymentMethod === 'cash' && order.paymentStatus === 'pending_cash';

  return (
    <div>
      <Link to="/admin/orders" className="kiosk-back" style={{ textDecoration: 'none' }}>
        ← {t('admin.backToOrders')}
      </Link>

      <div className="card order-detail-card" style={{ marginTop: 'var(--space-4)' }}>
        <h1>{order.orderNumber}</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t('admin.businessDate')}: {order.businessDate} · {t('admin.orderId')}: {order.id}
        </p>

        {error && (
          <div
            className="alert alert-warning"
            role="alert"
            style={{ marginBottom: 'var(--space-4)' }}
          >
            {error.message}
          </div>
        )}

        <div className="detail-grid">
          <div className="detail-field">
            <div className="label">{t('admin.status')}</div>
            <div className="value">
              <span className={`badge badge-${order.status}`}>{t(`statuses.${order.status}`)}</span>
            </div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.paymentMethod')}</div>
            <div className="value">
              <span
                className={`badge ${order.paymentMethod === 'cash' ? 'badge-cash_received' : 'badge-demo_confirmed'}`}
              >
                {order.paymentMethod === 'cash' ? t('admin.cashBadge') : t('admin.demoBadge')} ·{' '}
                {t(`paymentMethods.${order.paymentMethod}`)}
              </span>
            </div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.paymentStatus')}</div>
            <div className="value">
              <span className={`badge badge-${order.paymentStatus}`}>
                {t(`statuses.${order.paymentStatus}`)}
              </span>
            </div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.orderTime')}</div>
            <div className="value">{formatManilaDateTime(order.createdAt, locale)}</div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.total')}</div>
            <div className="value">{formatPeso(order.totalCentavos)}</div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.elapsed')}</div>
            <div className="value">
              <OrderTimer order={order} />
            </div>
          </div>
          <div className="detail-field">
            <div className="label">{t('admin.version')}</div>
            <div className="value">{order.version}</div>
          </div>
        </div>

        <section className="order-detail-items">
          <h2>{t('admin.orderItems')}</h2>
          {order.items.map((item, index) => (
            <div className="order-detail-item" key={`${item.productId}-${index}`}>
              <div>
                <div className="item-name">
                  {item.quantity}× {item.productName}
                </div>
                <div className="item-meta">
                  {formatPeso(item.unitPriceCentavos)}
                  {item.addons.length > 0 && (
                    <div>
                      {t('review.addons')}:{' '}
                      {item.addons
                        .map((a) => `${a.name} (+${formatPeso(a.priceCentavos)})`)
                        .join(', ')}
                    </div>
                  )}
                  {item.options.length > 0 && (
                    <div>
                      {t('review.options')}: {item.options.map((o) => o.name).join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontWeight: 800 }}>{formatPeso(item.lineTotalCentavos)}</div>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 800,
              fontSize: 'var(--text-lg)',
              paddingTop: 'var(--space-3)',
            }}
          >
            <span>{t('review.total')}</span>
            <span>{formatPeso(order.totalCentavos)}</span>
          </div>
        </section>

        <div className="order-detail-actions">
          {needsCashConfirmation && (
            <button
              type="button"
              className="btn btn-success"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  type: 'cash',
                  payload: { paymentStatus: 'cash_received', version: order.version },
                })
              }
            >
              {t('admin.confirmCash')}
            </button>
          )}
          {statusActions.map((action) => (
            <button
              type="button"
              key={action.status}
              className={`btn ${action.danger ? 'btn-danger' : 'btn-primary'}`}
              disabled={busy || action.disabled}
              onClick={() =>
                setConfirm({
                  type: 'status',
                  payload: { status: action.status, version: order.version },
                  label: action.label,
                  danger: action.danger,
                })
              }
            >
              {action.label}
            </button>
          ))}
        </div>

        {order.status === 'placed' && !preparingEnabled && (
          <p className="payment-gate-note" role="note">
            {t('admin.preparingPaymentRequired')}
          </p>
        )}

        {order.paymentMethod === 'demo_wallet' && (
          <div className="simulated-note" style={{ marginTop: 'var(--space-4)' }}>
            {t('payment.demoSimulatedNotice')}
          </div>
        )}
      </div>

      {confirm?.type === 'cash' && (
        <ConfirmDialog
          title={t('admin.confirmCashTitle')}
          body={t('admin.confirmCashBody')}
          confirmLabel={t('admin.confirmCash')}
          onConfirm={() => mutate(`/admin/orders/${id}/payment`, confirm.payload)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'status' && (
        <ConfirmDialog
          title={confirm.danger ? t('admin.cancelConfirmTitle') : t('admin.confirmTransitionTitle')}
          body={
            confirm.danger
              ? t('admin.cancelConfirmBody')
              : t('admin.confirmTransitionBody', {
                  status: t(`statuses.${confirm.payload.status}`),
                })
          }
          confirmLabel={confirm.label}
          danger={confirm.danger}
          onConfirm={() => mutate(`/admin/orders/${id}/status`, confirm.payload)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
