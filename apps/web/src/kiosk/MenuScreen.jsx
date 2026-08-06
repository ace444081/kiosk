import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { formatPeso } from '@kiosk/shared';
import { fetchMenu } from '../services/menu-service.js';
import { setKioskLocale } from '../i18n/index.js';
import { useCart } from './CartContext.jsx';
import { useKioskContext } from './KioskLayout.jsx';
import { CartPanel } from './CartPanel.jsx';
import { ProductImage } from '../components/KioskBits.jsx';

export function MenuScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { online } = useKioskContext();
  const { items: _items, totals, clearSession } = useCart();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';

  const [menu, setMenu] = useState(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchMenu(locale);
        if (!cancelled) {
          setMenu(result.menu);
          setStale(result.stale);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err);
          setMenu(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  const categories = useMemo(() => menu?.categories || [], [menu]);
  const products = useMemo(() => {
    if (!menu) return [];
    const query = search.trim().toLowerCase();
    return categories.flatMap((category) =>
      category.products
        .filter(() => activeCategory === 'all' || category.id === activeCategory)
        .filter(
          (p) =>
            !query ||
            p.name.toLowerCase().includes(query) ||
            p.description.toLowerCase().includes(query),
        ),
    );
  }, [menu, categories, search, activeCategory]);

  const startNewSession = () => {
    clearSession();
    navigate('/kiosk');
  };

  const goCustomize = (product) => {
    navigate(`/kiosk/customize/${product.id}`);
  };

  if (loading) {
    return (
      <main className="menu-main" aria-busy="true">
        <div className="empty-state">
          <p>{t('common.loading')}</p>
        </div>
      </main>
    );
  }

  if (loadError && !menu) {
    return (
      <main className="menu-main">
        <div className="empty-state" role="alert">
          <h2>{t('offline.title')}</h2>
          <p>{t('offline.body')}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {t('offline.retry')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="menu-body">
      <div className="menu-main">
        <header className="kiosk-header">
          <button
            type="button"
            className="kiosk-back"
            onClick={startNewSession}
            aria-label={t('welcome.startOrder')}
          >
            ←
          </button>
          <img src="/placeholders/logo.svg" alt="" className="header-logo" width="64" height="40" />
          <h1 className="header-title">
            {t('common.appName')}
            <small>{t('menu.title')}</small>
          </h1>
          <div className="kiosk-search">
            <label htmlFor="menu-search" className="sr-only">
              {t('menu.searchPlaceholder')}
            </label>
            <input
              id="menu-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('menu.searchPlaceholder')}
            />
          </div>
          <div
            className="header-lang language-selector"
            role="group"
            aria-label={t('common.language')}
          >
            <button
              type="button"
              className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
              aria-pressed={locale === 'en'}
              onClick={() => setKioskLocale('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-btn ${locale === 'fil' ? 'active' : ''}`}
              aria-pressed={locale === 'fil'}
              onClick={() => setKioskLocale('fil')}
            >
              FIL
            </button>
          </div>
        </header>

        {stale && (
          <div className="alert alert-warning" role="status" style={{ margin: 'var(--space-3)' }}>
            {t('offline.degraded')}
          </div>
        )}

        <nav className="category-nav" aria-label={t('menu.title')}>
          <button
            type="button"
            className={`category-btn ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            {t('menu.allCategories')}
          </button>
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              className={`category-btn ${activeCategory === category.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>

        <div className="product-grid">
          {products.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <h2>{t('menu.searchNoResults')}</h2>
            </div>
          )}
          {products.map((product) => (
            <article
              className={`card product-card ${product.isAvailable ? '' : 'sold-out'}`}
              key={product.id}
            >
              <ProductImage src={product.imagePath} alt={product.name} width="600" height="400" />
              <div className="product-info">
                <h2 className="product-name">{product.name}</h2>
                <p className="product-desc">{product.description}</p>
                <div className="product-footer">
                  <span className="product-price">{formatPeso(product.priceCentavos)}</span>
                  {product.isAvailable ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => goCustomize(product)}
                    >
                      {product.optionGroups?.length > 0 ? t('menu.customize') : t('menu.addToCart')}
                    </button>
                  ) : (
                    <span className="sold-out-tag">{t('menu.soldOut')}</span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Desktop cart panel */}
      <div className="desktop-cart">
        <CartPanel onCheckout={() => navigate('/kiosk/review')} disabled={!online} />
      </div>

      {/* Mobile cart trigger */}
      <button
        type="button"
        className="cart-drawer-trigger"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={drawerOpen}
      >
        <span>{t('cart.title')}</span>
        <span aria-hidden="true">{totals.count}</span>
        <span>{formatPeso(totals.totalCentavos)}</span>
      </button>

      {drawerOpen && (
        <div className="cart-drawer" role="dialog" aria-modal="true" aria-label={t('cart.title')}>
          <div className="cart-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="cart-drawer-panel">
            <button
              type="button"
              className="cart-drawer-close"
              onClick={() => setDrawerOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <CartPanel
              onCheckout={() => {
                setDrawerOpen(false);
                navigate('/kiosk/review');
              }}
              disabled={!online}
            />
          </div>
        </div>
      )}
    </div>
  );
}
