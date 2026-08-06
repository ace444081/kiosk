import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MINUTE_MS = 60 * 1000;

export function timerThresholds(itemCount = 1) {
  const count = Math.max(1, Number(itemCount) || 1);
  return {
    yellowAt: MINUTE_MS,
    redAt: (3 + count - 1) * MINUTE_MS,
    overdueAt: (5 + 2 * (count - 1)) * MINUTE_MS,
  };
}

function timestamp(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isOrderTimerActive(order) {
  return ['preparing', 'ready'].includes(order?.status) && Boolean(timestamp(order?.preparingAt));
}

export function getOrderTimerState(order, now = Date.now()) {
  const start = timestamp(order?.preparingAt);
  const completed = timestamp(order?.completedAt);

  if (order?.status === 'completed') {
    const elapsedSeconds =
      start && completed ? Math.max(0, Math.floor((completed - start) / 1000)) : null;
    return { phase: 'completed', elapsedSeconds };
  }

  if (order?.status === 'cancelled') {
    return { phase: 'cancelled', elapsedSeconds: 0 };
  }

  if (!isOrderTimerActive(order)) {
    return { phase: 'idle', elapsedSeconds: 0 };
  }

  const elapsedMs = Math.max(0, now - start);
  const thresholds = timerThresholds(order.itemCount);
  let phase = 'on-time';
  if (elapsedMs >= thresholds.overdueAt) phase = 'overdue';
  else if (elapsedMs >= thresholds.redAt) phase = 'red';
  else if (elapsedMs >= thresholds.yellowAt) phase = 'attention';

  return {
    phase,
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    thresholds,
  };
}

export function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safeSeconds / 60)}m ${String(safeSeconds % 60).padStart(2, '0')}s`;
}

export function useOrderClock(enabled) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  return now;
}

const phaseLabels = {
  idle: 'timerNotStarted',
  'on-time': 'timerOnTime',
  attention: 'timerAttention',
  red: 'timerUrgent',
  overdue: 'timerOverdue',
  completed: 'timerCompleted',
  cancelled: 'timerCancelled',
};

export function OrderTimer({ order, now }) {
  const { t } = useTranslation();
  const ownNow = useOrderClock(now === undefined && isOrderTimerActive(order));
  const state = getOrderTimerState(order, now ?? ownNow);
  const value =
    state.elapsedSeconds === null || state.phase === 'idle' || state.phase === 'cancelled'
      ? '-'
      : formatElapsed(state.elapsedSeconds);
  const label = t(`admin.${phaseLabels[state.phase]}`);

  return (
    <span
      className={`order-timer order-timer-${state.phase}`}
      aria-label={t('admin.timerLabel', { time: value, status: label })}
      title={label}
    >
      <span className="order-timer-value">{value}</span>
      <span className="order-timer-status">{label}</span>
    </span>
  );
}
