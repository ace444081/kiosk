import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { useCart } from './CartContext.jsx';
import { QuantityStepper, Price } from '../components/KioskBits.jsx';

export function CartPanel({ onCheckout, disabled = false }) {
  const { t } = useTranslation();
  const { items, totals, updateQuantity, removeItem, clearCart } = useCart();

  return (
    <aside className="cart-panel" aria-label={t('cart.title')}>
      <div className="cart-panel-header">
        <h2>{t('cart.title')}</h2>
        {items.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearCart}>
            {t('cart.clearCart')}
          </button>
        )}
      </div>
      <div className="cart-items">
        {items.length === 0 && (
          <div className="empty-state">
            <p>{t('menu.cartEmpty')}</p>
            <p>{t('menu.cartEmptyHint')}</p>
          </div>
        )}
        {items.map((item) => (
          <div className="cart-line" key={item.key}>
            <div className="cart-line-top">
              <div>
                <div className="cart-line-name">{item.name}</div>
                {(item.addons.length > 0 || item.options.length > 0) && (
                  <div className="cart-line-meta">
                    {[...item.addons.map((a) => a.name), ...item.options.map((o) => o.name)].join(
                      ' · ',
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="cart-line-remove"
                aria-label={`${t('cart.remove')}: ${item.name}`}
                onClick={() => removeItem(item.key)}
              >
                ✕
              </button>
            </div>
            <div className="cart-line-bottom">
              <QuantityStepper
                value={item.quantity}
                onChange={(v) => updateQuantity(item.key, v - item.quantity)}
              />
              <Price centavos={item.lineTotalCentavos} className="product-price" />
            </div>
          </div>
        ))}
      </div>
      <div className="cart-panel-footer">
        <div className="cart-total-row">
          <span>{t('menu.total')}</span>
          <span>{formatPeso(totals.totalCentavos)}</span>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={items.length === 0 || disabled}
          onClick={onCheckout}
        >
          {t('menu.checkout')} ({totals.count}{' '}
          {totals.count === 1 ? t('common.item') : t('common.items')})
        </button>
        {disabled && (
          <p className="field-error" role="status">
            {t('offline.checkoutDisabled')}
          </p>
        )}
      </div>
    </aside>
  );
}
