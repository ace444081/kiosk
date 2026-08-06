import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { useCart } from './CartContext.jsx';
import { useKioskContext } from './KioskLayout.jsx';
import { ApiError } from '../services/api.js';

export function PaymentScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { online } = useKioskContext();
  const { totals, submitOrder, clearSession } = useCart();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  const [mode, setMode] = useState(null); // null | 'cash' | 'demo'
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [demoReference, setDemoReference] = useState(null);

  const submit = async (paymentMethod) => {
    setProcessing(true);
    setError(null);
    try {
      const order = await submitOrder({ paymentMethod, locale });
      if (order.duplicate) {
        // Same idempotency key was already accepted: show the original order.
        navigate('/kiosk/confirmation', { state: { order, duplicate: true } });
        return;
      }
      navigate('/kiosk/confirmation', { state: { order } });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NETWORK_ERROR') {
        setError('errors.NETWORK_ERROR');
      } else if (err instanceof ApiError) {
        // Item-level validation failures surface per-field (e.g. an item
        // sold out after it was added to the cart); map them to specific,
        // localized messages.
        const fieldValues = Object.values(err.fieldErrors || {});
        const specificCode = fieldValues.find((value) =>
          [
            'PRODUCT_UNAVAILABLE',
            'PRODUCT_NOT_FOUND',
            'REQUIRED_OPTIONS',
            'ADDON_INCOMPATIBLE',
            'ADDON_NOT_FOUND',
            'OPTION_NOT_FOUND',
            'QUANTITY_OUT_OF_RANGE',
          ].includes(value),
        );
        if (specificCode === 'PRODUCT_UNAVAILABLE' || specificCode === 'PRODUCT_NOT_FOUND') {
          clearSession();
        }
        const key = `errors.${specificCode || err.code}`;
        setError(i18n.exists(key) ? key : 'errors.GENERIC');
      } else {
        setError('errors.GENERIC');
      }
    } finally {
      setProcessing(false);
    }
  };

  const chooseDemo = () => {
    // Generate a clearly non-financial local reference; the server also
    // records demo orders as demo_confirmed (simulated).
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'DEMO-';
    for (let i = 0; i < 8; i += 1) ref += alphabet[Math.floor(Math.random() * alphabet.length)];
    setDemoReference(ref);
    setMode('demo');
  };

  if (mode === 'demo') {
    return (
      <main className="payment-screen">
        <button type="button" className="kiosk-back" onClick={() => setMode(null)}>
          ← {t('payment.back')}
        </button>
        <h1>{t('payment.demoWalletTitle')}</h1>

        <div className="demo-warning" role="alert">
          {t('payment.demoWarningTitle')}
          <br />
          {t('payment.demoWarningBody')}
        </div>

        <div className="demo-qr-box">
          <img
            src="/placeholders/demo-qr.svg"
            alt={t('payment.scanPlaceholder')}
            width="320"
            height="320"
          />
          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            {t('payment.scanPlaceholder')}
          </p>
          <div className="demo-reference">
            {t('payment.demoReferenceLabel')}: {demoReference}
          </div>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {t(error)}
          </p>
        )}

        <div className="review-actions" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="btn btn-accent btn-lg"
            disabled={processing || !online}
            onClick={() => submit('demo_wallet')}
          >
            {processing ? t('payment.demoProcessing') : t('payment.payDemo')}
          </button>
        </div>
        <p style={{ color: 'var(--color-text-secondary)', maxWidth: 520, textAlign: 'center' }}>
          {t('payment.demoSimulatedNotice')}
        </p>
      </main>
    );
  }

  return (
    <main className="payment-screen">
      <button type="button" className="kiosk-back" onClick={() => navigate('/kiosk/review')}>
        ← {t('payment.back')}
      </button>
      <h1>{t('payment.title')}</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-lg)' }}>
        <strong style={{ color: 'var(--color-navy)', fontSize: 'var(--text-2xl)' }}>
          {formatPeso(totals.totalCentavos)}
        </strong>
      </p>

      {error && (
        <p className="field-error" role="alert">
          {t(error)}
        </p>
      )}

      <div className="payment-methods">
        <div className="payment-method-card">
          <h2>{t('payment.cashTitle')}</h2>
          <p>{t('payment.cashInstruction')}</p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={processing || !online}
            onClick={() => submit('cash')}
          >
            {processing ? t('payment.placingOrder') : t('payment.payCash')}
          </button>
        </div>

        <div className="payment-method-card">
          <h2>{t('payment.demoWalletTitle')}</h2>
          <p>{t('payment.demoWalletDescription')}</p>
          <div className="demo-warning" style={{ fontSize: 'var(--text-sm)' }}>
            {t('payment.demoWarningTitle')}
          </div>
          <button
            type="button"
            className="btn btn-accent btn-lg"
            disabled={processing || !online}
            onClick={chooseDemo}
          >
            {t('payment.demoWallet')}
          </button>
        </div>
      </div>

      {!online && (
        <p className="field-error" role="status">
          {t('offline.checkoutDisabled')}
        </p>
      )}
    </main>
  );
}
