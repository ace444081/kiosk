import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { api } from '../services/api.js';
import { adminPatch } from '../services/admin-api.js';
import { ConfirmDialog, ProductImage } from '../components/KioskBits.jsx';
import { AdminProductFormDialog } from './AdminProductFormDialog.jsx';

function formatUpdatedAt(iso, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'fil' ? 'fil-PH' : 'en-PH', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Manila',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export function AdminMenu() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'fil' ? 'fil' : 'en';
  const [products, setProducts] = useState(null);
  const [categories, setCategories] = useState([]);
  const [addons, setAddons] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [confirm, setConfirm] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (availabilityFilter !== 'all') params.set('availability', availabilityFilter);
      const payload = await api.get(`/admin/products?${params.toString()}`);
      setProducts(payload.products);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [search, categoryFilter, availabilityFilter]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    api
      .get('/admin/menu-config')
      .then((payload) => {
        setCategories(payload.categories);
        setAddons(payload.addons);
      })
      .catch(() => setError({ message: t('admin.loadError') }));
  }, [t]);

  const mergeProduct = (nextProduct) => {
    setProducts((previous) =>
      previous?.map((product) =>
        product.id === nextProduct.id ? { ...product, ...nextProduct } : product,
      ),
    );
  };

  const changeAvailability = async (product, isAvailable) => {
    setBusy(true);
    setConfirm(null);
    try {
      const payload = await adminPatch(`/admin/products/${product.id}/availability`, {
        isAvailable,
        version: product.version,
      });
      mergeProduct(payload.product);
      setError(null);
    } catch (err) {
      if (err.code === 'STALE_VERSION' && err.product) mergeProduct(err.product);
      setError({
        message:
          err.code === 'STALE_VERSION' ? t('admin.productVersionConflict') : t('admin.loadError'),
      });
    } finally {
      setBusy(false);
    }
  };

  const changePublication = async (product, isPublished, isAvailable = false) => {
    setBusy(true);
    setConfirm(null);
    try {
      const payload = await adminPatch(`/admin/products/${product.id}/publication`, {
        isPublished,
        isAvailable: isPublished ? isAvailable : false,
        version: product.version,
      });
      mergeProduct(payload.product);
      setError(null);
    } catch (err) {
      if (err.code === 'STALE_VERSION' && err.product) mergeProduct(err.product);
      setError({
        message:
          err.code === 'STALE_VERSION' ? t('admin.productVersionConflict') : t('admin.loadError'),
      });
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    if (!products) return null;
    return {
      total: products.length,
      available: products.filter((product) => product.isPublished && product.isAvailable).length,
      soldOut: products.filter((product) => product.isPublished && !product.isAvailable).length,
      drafts: products.filter((product) => !product.isPublished).length,
    };
  }, [products]);

  return (
    <div>
      <div className="admin-page-heading">
        <div>
          <h1>{t('admin.menuTitle')}</h1>
          <p>{t('admin.menuManageIntro')}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          {t('admin.addProduct')}
        </button>
      </div>

      <div className="menu-admin-toolbar">
        <label htmlFor="product-search" className="sr-only">
          {t('admin.searchProducts')}
        </label>
        <input
          id="product-search"
          type="search"
          placeholder={t('admin.searchProducts')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label htmlFor="product-category-filter" className="sr-only">
          {t('admin.filterCategory')}
        </label>
        <select
          id="product-category-filter"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">{t('admin.allCategories')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {locale === 'fil' ? category.nameFil : category.nameEn}
            </option>
          ))}
        </select>
        <label htmlFor="product-availability-filter" className="sr-only">
          {t('admin.availability')}
        </label>
        <select
          id="product-availability-filter"
          value={availabilityFilter}
          onChange={(event) => setAvailabilityFilter(event.target.value)}
        >
          <option value="all">{t('admin.allAvailability')}</option>
          <option value="available">{t('admin.available')}</option>
          <option value="sold_out">{t('admin.soldOut')}</option>
        </select>
      </div>

      {counts && (
        <p className="menu-counts">
          {counts.total} {t('common.items')} · {counts.available} {t('admin.available')} ·{' '}
          {counts.soldOut} {t('admin.soldOut')} · {counts.drafts} {t('admin.drafts')}
        </p>
      )}

      {error && (
        <div className="alert alert-warning" role="alert">
          {error.message}
        </div>
      )}

      {!products ? (
        <div className="empty-state">
          <p>{t('common.loading')}</p>
        </div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <p>{t('admin.noProductsFound')}</p>
        </div>
      ) : (
        <div className="product-admin-list">
          {products.map((product) => (
            <article className="product-admin-card" key={product.id}>
              <ProductImage src={product.imagePath} alt="" width="76" height="64" />
              <div className="product-admin-info">
                <div className="product-admin-name">{product.name}</div>
                <div className="product-admin-meta">
                  {product.categoryName} · {formatPeso(product.priceCentavos)}
                  <br />
                  {t('admin.lastUpdated')}: {formatUpdatedAt(product.updatedAt, locale)}
                </div>
                <div className="product-statuses">
                  {!product.isPublished ? (
                    <span className="badge badge-pending_cash">{t('admin.draft')}</span>
                  ) : product.isAvailable ? (
                    <span className="badge badge-completed">{t('admin.available')}</span>
                  ) : (
                    <span className="badge badge-cancelled">{t('admin.soldOut')}</span>
                  )}
                  {product.isPublished && (
                    <span className="kiosk-visibility">{t('admin.visibleOnKiosk')}</span>
                  )}
                </div>
              </div>
              <div className="product-admin-actions">
                {!product.isPublished ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'publish', product })}
                  >
                    {t('admin.publish')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={`btn ${product.isAvailable ? 'btn-danger' : 'btn-success'}`}
                      disabled={busy}
                      onClick={() =>
                        setConfirm({
                          type: 'availability',
                          product,
                          isAvailable: !product.isAvailable,
                        })
                      }
                    >
                      {product.isAvailable ? t('admin.markSoldOut') : t('admin.markAvailable')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => setConfirm({ type: 'hide', product })}
                    >
                      {t('admin.hideFromKiosk')}
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {confirm?.type === 'availability' && (
        <ConfirmDialog
          title={t('admin.confirmAvailabilityTitle')}
          body={t('admin.confirmAvailabilityBody', {
            name: confirm.product.name,
            state: confirm.isAvailable ? t('admin.available') : t('admin.soldOut'),
          })}
          confirmLabel={confirm.isAvailable ? t('admin.markAvailable') : t('admin.markSoldOut')}
          danger={!confirm.isAvailable}
          onConfirm={() => changeAvailability(confirm.product, confirm.isAvailable)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'publish' && (
        <ConfirmDialog
          title={t('admin.publishProductTitle')}
          body={t('admin.publishProductBody', { name: confirm.product.name })}
          confirmLabel={t('admin.publishUnavailable')}
          onConfirm={() => changePublication(confirm.product, true, false)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.type === 'hide' && (
        <ConfirmDialog
          title={t('admin.hideProductTitle')}
          body={t('admin.hideProductBody', { name: confirm.product.name })}
          confirmLabel={t('admin.hideFromKiosk')}
          danger
          onConfirm={() => changePublication(confirm.product, false, false)}
          onCancel={() => setConfirm(null)}
        />
      )}
      {showForm && (
        <AdminProductFormDialog
          categories={categories}
          addons={addons}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}
