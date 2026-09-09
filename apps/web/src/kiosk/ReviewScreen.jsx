import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { useCart } from './CartContext.jsx';
import { useKioskContext } from './KioskLayout.jsx';
import { ConfirmDialog, Price, ProductImage, QuantityStepper } from '../components/KioskBits.jsx';
import { fetchMenu } from '../services/menu-service.js';

export function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { online } = useKioskContext();
  const { items, totals, addItem, updateQuantity, removeItem, clearCart } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);
  const [menu, setMenu] = useState(null);
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  useEffect(() => {
    let cancelled = false;
    fetchMenu(locale, { force: true })
      .then((result) => {
        if (!cancelled) setMenu(result.menu);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const recommendations = useMemo(() => {
    if (!menu) return [];
    const products = menu.categories.flatMap((category) =>
      category.products.map((product) => ({ ...product, categoryId: category.id })),
    );
    const productById = new Map(products.map((product) => [product.id, product]));
    const cartProductIds = new Set(items.map((item) => item.productId));
    const recommendedIds = [];
    for (const item of items) {
      const product = productById.get(item.productId);
      for (const recommendationId of product?.recommendationIds || []) {
        if (!recommendedIds.includes(recommendationId)) recommendedIds.push(recommendationId);
      }
    }
    return recommendedIds
      .map((id) => productById.get(id))
      .filter((product) => product?.isAvailable && !cartProductIds.has(product.id))
      .slice(0, 4);
  }, [items, menu]);

  const addRecommendation = (product) => {
    if (product.optionGroups?.length) {
      navigate(`/kiosk/customize/${product.id}?returnTo=review`);
      return;
    }
    addItem({
      key: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: product.id,
      name: product.name,
      unitPriceCentavos: product.priceCentavos,
      unitTotalCentavos: product.priceCentavos,
      quantity: 1,
      stockQuantity: product.stockQuantity,
      addons: [],
      options: [],
      lineTotalCentavos: product.priceCentavos,
    });
  };

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
                        max={Math.min(
                          20,
                          item.stockQuantity == null
                            ? 20
                            : Math.max(
                                1,
                                item.stockQuantity -
                                  items
                                    .filter(
                                      (other) =>
                                        other.key !== item.key &&
                                        other.productId === item.productId,
                                    )
                                    .reduce((sum, other) => sum + other.quantity, 0),
                              ),
                        )}
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

            {recommendations.length > 0 && (
              <section className="recommendations" aria-labelledby="recommendations-title">
                <div className="recommendations-heading">
                  <span>{t('review.recommendedEyebrow')}</span>
                  <h2 id="recommendations-title">{t('review.recommendedAddons')}</h2>
                  <p>{t('review.recommendedHint')}</p>
                </div>
                <div className="recommendation-grid">
                  {recommendations.map((product) => (
                    <article className="recommendation-card" key={product.id}>
                      <ProductImage
                        src={product.imagePath}
                        sku={product.sku}
                        alt={product.name}
                        width="180"
                        height="120"
                      />
                      <div>
                        <strong>{product.name}</strong>
                        <span>{formatPeso(product.priceCentavos)}</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => addRecommendation(product)}
                      >
                        {product.optionGroups?.length
                          ? t('review.customizeAddon')
                          : t('review.addRecommendation')}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

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
