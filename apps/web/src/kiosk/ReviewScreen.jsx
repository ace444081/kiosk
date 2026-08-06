import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { useCart } from './CartContext.jsx';
import { useKioskContext } from './KioskLayout.jsx';
import { ConfirmDialog, Price, QuantityStepper } from '../components/KioskBits.jsx';

export function ReviewScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { online } = useKioskContext();
  const { items, totals, updateQuantity, removeItem, clearCart } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);

  const canContinue = items.length > 0 && online;

  return (
    <main className="review-screen">
      <div className="card review-card">
        <button type="button" className="kiosk-back" onClick={() => navigate('/kiosk/menu')}>
          ← {t('review.backToMenu')}
        </button>
        <h1>{t('review.title')}</h1>

        {items.length === 0 ? (
          <div className="empty-state">
            <h2>{t('review.emptyTitle')}</h2>
            <p>{t('review.emptyBody')}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/kiosk/menu')}
            >
              {t('review.backToMenu')}
            </button>
          </div>
        ) : (
          <>
            <div className="review-lines">
              {items.map((item) => (
                <div className="review-line" key={item.key}>
                  <div className="review-line-main">
                    <div className="review-line-name">{item.name}</div>
                    <div className="review-line-meta">
                      {`${formatPeso(item.unitTotalCentavos ?? item.unitPriceCentavos)} × ${item.quantity}`}
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
                    <div
                      className="review-line-actions"
                      style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        marginTop: 'var(--space-2)',
                      }}
                    >
                      <QuantityStepper
                        value={item.quantity}
                        onChange={(v) => updateQuantity(item.key, v - item.quantity)}
                        label={`${t('review.items')}: ${item.name}`}
                      />
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => removeItem(item.key)}
                        style={{ minHeight: 40, padding: 'var(--space-1) var(--space-3)' }}
                      >
                        {t('cart.remove')}
                      </button>
                    </div>
                  </div>
                  <Price centavos={item.lineTotalCentavos} className="review-line-total" />
                </div>
              ))}
            </div>

            <div className="review-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
                {t('cart.clearCart')}
              </button>
            </div>

            <div className="review-totals">
              <div className="row">
                <span>{t('review.subtotal')}</span>
                <span>{formatPeso(totals.subtotalCentavos)}</span>
              </div>
              <div className="row total">
                <span>{t('review.total')}</span>
                <span>{formatPeso(totals.totalCentavos)}</span>
              </div>
            </div>

            {!online && (
              <p className="field-error" role="status">
                {t('offline.checkoutDisabled')}
              </p>
            )}

            <div className="review-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={!canContinue}
                onClick={() => navigate('/kiosk/payment')}
              >
                {t('review.continueToPayment')}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmClear && (
        <ConfirmDialog
          title={t('cart.clearCartConfirmTitle')}
          body={t('cart.clearCartConfirmBody')}
          confirmLabel={t('cart.clearCart')}
          danger
          onConfirm={() => {
            clearCart();
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </main>
  );
}
