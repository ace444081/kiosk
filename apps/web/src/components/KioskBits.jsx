import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';

/** Placeholder-aware product image with graceful degradation. */
export function ProductImage({ src, alt, className, width, height }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed || !src) {
    return (
      <div className={`product-image-fallback ${className || ''}`} role="img" aria-label={alt}>
        <span aria-hidden="true">☕</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function QuantityStepper({ value, onChange, min = 1, max = 20, label }) {
  const { t } = useTranslation();
  return (
    <div className="qty-stepper">
      <button
        type="button"
        aria-label={t('customize.quantity')}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="qty-value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={label || t('customize.quantity')}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger,
}) {
  const { t } = useTranslation();
  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} autoFocus>
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Price({ centavos, className }) {
  return <span className={className}>{formatPeso(centavos)}</span>;
}
