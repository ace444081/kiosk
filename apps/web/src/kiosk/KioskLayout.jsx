import { useCallback, useRef, useState } from 'react';
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIdleTimer } from '../hooks/useIdleTimer.js';
import { useServerStatus } from '../hooks/useServerStatus.js';
import { CartProvider, useCart } from './CartContext.jsx';

function TimeoutOverlay({ onContinue, secondsLeft }) {
  const { t } = useTranslation();
  return (
    <div
      className="timeout-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="timeout-title"
    >
      <div className="timeout-dialog">
        <h2 id="timeout-title">{t('timeout.warningTitle')}</h2>
        <p>{t('timeout.warningBody', { seconds: secondsLeft })}</p>
        <p className="timeout-countdown">
          {t('timeout.secondsRemaining', { seconds: secondsLeft })}
        </p>
        <button type="button" className="btn btn-primary btn-lg" onClick={onContinue}>
          {t('timeout.continueSession')}
        </button>
      </div>
    </div>
  );
}

function OfflineBanner({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="offline-banner" role="alert">
      <span>
        <strong>{t('offline.title')}.</strong> {t('offline.body')}
      </span>
      <button type="button" className="btn" onClick={onRetry}>
        {t('offline.retry')}
      </button>
    </div>
  );
}

function KioskInner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { submitting, clearSession } = useCart();
  const { online, retry } = useServerStatus({});
  const [resetNotice, setResetNotice] = useState(false);
  const noticeTimer = useRef(null);

  const handleReset = useCallback(() => {
    clearSession();
    setResetNotice(true);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setResetNotice(false), 4000);
    navigate('/kiosk', { replace: true });
  }, [clearSession, navigate]);

  const {
    state: idleState,
    secondsLeft,
    continueSession,
  } = useIdleTimer({
    enabled: true,
    isProtected: submitting,
    onReset: handleReset,
  });

  return (
    <div className="kiosk-shell">
      {!online && <OfflineBanner onRetry={retry} />}
      {resetNotice && (
        <div className="alert alert-info" role="status" style={{ margin: 'var(--space-3)' }}>
          {t('timeout.resetNotice')}
        </div>
      )}
      <Outlet context={{ online }} />
      {idleState === 'warning' && (
        <TimeoutOverlay onContinue={continueSession} secondsLeft={secondsLeft} />
      )}
    </div>
  );
}

export function KioskLayout() {
  return (
    <CartProvider>
      <KioskInner />
    </CartProvider>
  );
}

export function useKioskContext() {
  return useOutletContext() || { online: true };
}
