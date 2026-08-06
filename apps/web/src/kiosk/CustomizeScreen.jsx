import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatPeso, MAX_QUANTITY } from '@kiosk/shared';
import { fetchMenu } from '../services/menu-service.js';
import { useCart } from './CartContext.jsx';
import { ProductImage, QuantityStepper, Price } from '../components/KioskBits.jsx';

export function CustomizeScreen() {
  const { t, i18n } = useTranslation();
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  const [menu, setMenu] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [selectedOptions, setSelectedOptions] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchMenu(locale);
        if (!cancelled) {
          setMenu(result.menu);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const product = useMemo(() => {
    if (!menu) return null;
    for (const category of menu.categories) {
      const found = category.products.find((p) => p.id === productId);
      if (found) return found;
    }
    return null;
  }, [menu, productId]);

  const toggleAddon = (addon) => {
    setSelectedAddons((prev) =>
      prev.some((a) => a.id === addon.id)
        ? prev.filter((a) => a.id !== addon.id)
        : [...prev, addon],
    );
  };

  const toggleOption = (option) => {
    setSelectedOptions((prev) =>
      prev.some((o) => o.id === option.id)
        ? prev.filter((o) => o.id !== option.id)
        : [...prev, option],
    );
  };

  const validationError = useMemo(() => {
    if (!product) return null;
    for (const group of product.optionGroups || []) {
      const selected = selectedOptions.filter((o) =>
        group.options.some((go) => go.id === o.id),
      ).length;
      if (group.isRequired && selected < group.minSelect) {
        return t('customize.selectRequired');
      }
      if (group.maxSelect > 0 && selected > group.maxSelect) {
        return t('errors.OPTION_LIMIT');
      }
    }
    return null;
  }, [product, selectedOptions, t]);

  const lineTotal = useMemo(() => {
    if (!product) return 0;
    const addonTotal = selectedAddons.reduce((s, a) => s + a.priceCentavos, 0);
    const optionTotal = selectedOptions.reduce((s, o) => s + o.priceCentavos, 0);
    return (product.priceCentavos + addonTotal + optionTotal) * quantity;
  }, [product, selectedAddons, selectedOptions, quantity]);

  const addToCart = () => {
    if (!product) return;
    if (validationError) {
      setError({ code: 'REQUIRED_OPTIONS' });
      return;
    }
    const addonTotal = selectedAddons.reduce((s, a) => s + a.priceCentavos, 0);
    const optionTotal = selectedOptions.reduce((s, o) => s + o.priceCentavos, 0);
    addItem({
      key: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productId: product.id,
      name: product.name,
      unitPriceCentavos: product.priceCentavos,
      unitTotalCentavos: product.priceCentavos + addonTotal + optionTotal,
      quantity,
      addons: selectedAddons.map((a) => ({
        id: a.id,
        name: a.name,
        priceCentavos: a.priceCentavos,
      })),
      options: selectedOptions.map((o) => ({
        id: o.id,
        name: o.name,
        priceCentavos: o.priceCentavos,
      })),
      lineTotalCentavos: lineTotal,
    });
    navigate('/kiosk/menu');
  };

  if (loading) {
    return (
      <main className="customize-screen">
        <p>{t('common.loading')}</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="customize-screen">
        <div className="card customize-card empty-state">
          <h2>{t('errors.PRODUCT_NOT_FOUND')}</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/kiosk/menu')}>
            {t('menu.backToMenu')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="customize-screen">
      <div className="card customize-card">
        <button type="button" className="kiosk-back" onClick={() => navigate('/kiosk/menu')}>
          ← {t('customize.backToMenu')}
        </button>
        <ProductImage src={product.imagePath} alt={product.name} width="600" height="400" />
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <Price centavos={product.priceCentavos} className="customize-price" />

        {(product.optionGroups || []).map((group) => (
          <section className="customize-section" key={group.id}>
            <h2>
              {group.name}
              {group.isRequired && (
                <span className="badge badge-placed" style={{ marginLeft: 'var(--space-2)' }}>
                  {t('customize.requiredChoices')}
                </span>
              )}
            </h2>
            <div className="option-group" role="group" aria-label={group.name}>
              {group.options.map((option) => {
                const selected = selectedOptions.some((o) => o.id === option.id);
                return (
                  <label key={option.id} className={`option-label ${selected ? 'selected' : ''}`}>
                    <input
                      type={group.maxSelect === 1 ? 'radio' : 'checkbox'}
                      name={`group-${group.id}`}
                      checked={selected}
                      onChange={() => toggleOption(option)}
                    />
                    <span className="option-name">{option.name}</span>
                    {option.priceCentavos > 0 && (
                      <span className="option-price">{formatPeso(option.priceCentavos)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}

        {product.addons.length > 0 && (
          <section className="customize-section">
            <h2>{t('customize.addOns')}</h2>
            <p
              className="hint"
              style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}
            >
              {t('customize.addOnsHint')}
            </p>
            <div role="group" aria-label={t('customize.addOns')}>
              {product.addons.map((addon) => {
                const selected = selectedAddons.some((a) => a.id === addon.id);
                return (
                  <label key={addon.id} className={`addon-label ${selected ? 'selected' : ''}`}>
                    <input type="checkbox" checked={selected} onChange={() => toggleAddon(addon)} />
                    <span className="addon-name">{addon.name}</span>
                    <span className="addon-price">+{formatPeso(addon.priceCentavos)}</span>
                  </label>
                );
              })}
            </div>
          </section>
        )}

        <section className="customize-section">
          <h2>{t('customize.quantity')}</h2>
          <div className="qty-row">
            <QuantityStepper
              value={quantity}
              min={1}
              max={MAX_QUANTITY}
              onChange={setQuantity}
              label={t('customize.quantity')}
            />
            {quantity >= MAX_QUANTITY && (
              <span className="field-error">{t('customize.invalidQuantity')}</span>
            )}
          </div>
        </section>

        {error && (
          <p className="field-error" role="alert">
            {t(`errors.${error.code || 'GENERIC'}`)}
          </p>
        )}

        <div className="customize-total">
          <span>{t('customize.lineTotal')}</span>
          <span>{formatPeso(lineTotal)}</span>
        </div>

        <div className="customize-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={addToCart}
            disabled={Boolean(validationError)}
          >
            {t('customize.addToCart')} · {formatPeso(lineTotal)}
          </button>
        </div>
      </div>
    </main>
  );
}
