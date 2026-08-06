import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso, CONFIRMATION_AUTO_RESET_MS } from '@kiosk/shared';
import { useCart } from './CartContext.jsx';

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

export function ConfirmationScreen() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { clearSession } = useCart();
  const order = location.state?.order;
  const [secondsLeft, setSecondsLeft] = useState(Math.round(CONFIRMATION_AUTO_RESET_MS / 1000));
  const resetTimerRef = useRef(null);
  const isDemo = order?.paymentMethod === 'demo_wallet';

  useEffect(() => {
    if (!order) {
      navigate('/kiosk', { replace: true });
      return undefined;
    }
    // Automatic reset after 20 seconds for the next customer.
    const startedAt = Date.now();
    resetTimerRef.current = setInterval(() => {
      const left = Math.ceil((CONFIRMATION_AUTO_RESET_MS - (Date.now() - startedAt)) / 1000);
      setSecondsLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(resetTimerRef.current);
        clearSession();
        navigate('/kiosk', { replace: true });
      }
    }, 500);
    return () => clearInterval(resetTimerRef.current);
  }, [order, clearSession, navigate]);

  if (!order) return null;

  const finish = () => {
    clearSession();
    navigate('/kiosk', { replace: true });
  };

  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  return (
    <main className="confirmation-screen">
      <div className="card confirmation-card">
        <h1>{t('confirmation.title')}</h1>
        <div className="order-number" role="status" aria-live="polite">
          {order.orderNumber}
        </div>

        <div className="confirmation-status">
          <span className="badge badge-placed">{t(`statuses.${order.status}`)}</span>
          <span className={`badge badge-${order.paymentStatus}`}>
            {t(`statuses.${order.paymentStatus}`)}
          </span>
          {isDemo && (
            <span
              className="badge badge-cancelled"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
            >
              {t('print.demoWatermark')}
            </span>
          )}
        </div>

        {order.paymentMethod === 'cash' ? (
          <div className="alert alert-info">
            {t('confirmation.payAtCounterInstruction', { total: formatPeso(order.totalCentavos) })}
          </div>
        ) : (
          <div className="alert alert-warning" role="alert">
            {t('confirmation.demoPaymentNote')}
          </div>
        )}

        <p>{t('confirmation.thankYou')}</p>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          {t('confirmation.dateTime')}: {formatManilaDateTime(order.createdAt, locale)}
        </p>

        {/* Receipt area - the only thing printed by the print stylesheet */}
        <section className="receipt-print-area" aria-label={t('confirmation.receiptTitle')}>
          <div className="receipt-header">
            <div className="receipt-shop">{t('common.appName')}</div>
            <div className="receipt-title">{t('confirmation.receiptTitle')}</div>
          </div>
          <div className="divider" />
          <div className="row">
            <span>{t('receipt.orderNo')}</span>
            <span>{order.orderNumber}</span>
          </div>
          <div className="row">
            <span>{t('receipt.date')}</span>
            <span>{formatManilaDateTime(order.createdAt, locale).split(',')[0]}</span>
          </div>
          <div className="row">
            <span>{t('receipt.time')}</span>
            <span>{formatManilaDateTime(order.createdAt, locale).split(',')[1]?.trim()}</span>
          </div>
          <div className="divider" />
          <div className="receipt-items">
            {order.items.map((item, index) => (
              <div key={`${item.productId}-${index}`}>
                <div className="row">
                  <span>
                    {item.quantity}× {item.productName}
                  </span>
                  <span>{formatPeso(item.lineTotalCentavos)}</span>
                </div>
                {item.addons.map((addon) => (
                  <div className="row" key={addon.id} style={{ fontSize: '0.9em' }}>
                    <span> + {addon.name}</span>
                    <span>{formatPeso(addon.priceCentavos * item.quantity)}</span>
                  </div>
                ))}
                {item.options.map((option) => (
                  <div className="row" key={option.id} style={{ fontSize: '0.9em' }}>
                    <span> {option.name}</span>
                    <span>
                      {option.priceCentavos > 0
                        ? formatPeso(option.priceCentavos * item.quantity)
                        : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row">
            <span>{t('receipt.subtotal')}</span>
            <span>{formatPeso(order.subtotalCentavos)}</span>
          </div>
          <div className="row total">
            <span>{t('receipt.total')}</span>
            <span>{formatPeso(order.totalCentavos)}</span>
          </div>
          <div className="divider" />
          <div className="row">
            <span>{t('receipt.paymentMethod')}</span>
            <span>{t(`paymentMethods.${order.paymentMethod}`)}</span>
          </div>
          <div className="row">
            <span>{t('receipt.paymentStatus')}</span>
            <span>{t(`statuses.${order.paymentStatus}`)}</span>
          </div>
          {order.paymentMethod === 'cash' && (
            <p style={{ marginTop: 4 }}>{t('receipt.cashInstruction')}</p>
          )}
          {isDemo && <div className="demo-warning-print">{t('receipt.demoNotice')}</div>}
          <div className="thankyou">{t('receipt.thankYou')}</div>
          <p style={{ textAlign: 'center', fontSize: '0.85em', marginTop: 4 }}>
            {t('receipt.footer')}
          </p>
        </section>

        <div className="confirmation-actions no-print">
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => window.print()}>
            {t('confirmation.printReceipt')}
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={finish}>
            {t('confirmation.finish')}
          </button>
        </div>

        <p className="auto-reset-note no-print">
          {t('confirmation.newOrderIn', { seconds: secondsLeft })} —{' '}
          {t('confirmation.autoResetNotice')}
        </p>
      </div>
    </main>
  );
}
