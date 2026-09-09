import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminPatch } from '../services/admin-api.js';
import { generatedImageForSku } from '../data/product-image-library.js';

export function AdminCatalogDialog({ product, onClose, onSaved }) {
  const { t } = useTranslation();
  const [imagePath, setImagePath] = useState(product.imagePath);
  const [stock, setStock] = useState(
    product.stockQuantity == null ? '' : String(product.stockQuantity),
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const generatedImage = generatedImageForSku(product.sku || product.id);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await adminPatch(`/admin/products/${product.id}/catalog`, {
        imagePath: imagePath.trim(),
        stockQuantity: stock === '' ? null : Number.parseInt(stock, 10),
        version: product.version,
      });
      onSaved(payload.product);
    } catch (err) {
      setError(
        err.code === 'STALE_VERSION'
          ? t('admin.productVersionConflict')
          : err.message || t('admin.catalogUpdateError'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop admin-form-backdrop" role="presentation">
      <section
        className="admin-product-dialog admin-catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-dialog-title"
      >
        <div className="admin-dialog-heading">
          <div>
            <p className="admin-eyebrow">{t('admin.catalogControls')}</p>
            <h2 id="catalog-dialog-title">{product.name}</h2>
            <p>{t('admin.catalogControlsHint')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>

        <form className="admin-product-form" onSubmit={save}>
          <fieldset>
            <legend>{t('admin.productPicture')}</legend>
            <label>
              {t('admin.imageSource')}
              <input
                required
                value={imagePath}
                onChange={(event) => {
                  setImageFailed(false);
                  setImagePath(event.target.value);
                }}
              />
              <span className="field-hint">{t('admin.imageSourceHint')}</span>
            </label>
            {generatedImage && (
              <div className="image-library">
                <p className="image-library-heading">{t('admin.generatedImage')}</p>
                <button
                  type="button"
                  className={`image-library-option ${imagePath === generatedImage ? 'is-selected' : ''}`}
                  onClick={() => {
                    setImageFailed(false);
                    setImagePath(generatedImage);
                  }}
                  disabled={busy}
                  aria-pressed={imagePath === generatedImage}
                >
                  <img src={generatedImage} alt="" />
                  <span>{t('admin.useGeneratedImage')}</span>
                </button>
                <span className="field-hint">{t('admin.imageLibraryHint')}</span>
              </div>
            )}
            <div className="catalog-image-preview">
              {!imageFailed && imagePath ? (
                <img src={imagePath} alt={product.name} onError={() => setImageFailed(true)} />
              ) : (
                <span>{t('admin.imageUnavailable')}</span>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('admin.inventory')}</legend>
            <label>
              {t('admin.stockQuantity')}
              <input
                type="number"
                min="0"
                max="1000000"
                step="1"
                inputMode="numeric"
                value={stock}
                placeholder={t('admin.untrackedInventory')}
                onChange={(event) => setStock(event.target.value)}
              />
              <span className="field-hint">{t('admin.stockQuantityHint')}</span>
            </label>
          </fieldset>

          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <div className="admin-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy || imageFailed}>
              {busy ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
