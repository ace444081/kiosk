import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminPatch, adminUploadImage } from '../services/admin-api.js';

export function AdminCatalogDialog({ product, onClose, onSaved }) {
  const { t } = useTranslation();
  const [imagePath, setImagePath] = useState(product.imagePath);
  const [stock, setStock] = useState(
    product.stockQuantity == null ? '' : String(product.stockQuantity),
  );
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(
    () => () => {
      if (imagePreview && globalThis.URL?.revokeObjectURL) {
        globalThis.URL.revokeObjectURL(imagePreview);
      }
    },
    [imagePreview],
  );

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('admin.photoTypeError'));
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t('admin.photoSizeError'));
      event.target.value = '';
      return;
    }
    setError(null);
    setImageFailed(false);
    if (imagePreview && globalThis.URL?.revokeObjectURL) {
      globalThis.URL.revokeObjectURL(imagePreview);
    }
    setImageFile(file);
    setImagePreview(globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(file) : null);
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let version = product.version;
      let nextImagePath =
        String(imagePath || '').trim() || product.imagePath || '/placeholders/logo.svg';
      if (imageFile) {
        const imagePayload = await adminUploadImage(
          `/admin/products/${product.id}/image`,
          imageFile,
          version,
        );
        version = imagePayload.product.version;
        nextImagePath = imagePayload.product.imagePath;
      }
      const payload = await adminPatch(`/admin/products/${product.id}/catalog`, {
        imagePath: nextImagePath,
        stockQuantity: stock === '' ? null : Number.parseInt(stock, 10),
        version,
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
                value={imagePath}
                onChange={(event) => {
                  setImageFailed(false);
                  setImagePath(event.target.value);
                }}
              />
              <span className="field-hint">{t('admin.imageSourceHint')}</span>
            </label>
            <div className="admin-image-upload">
              <label htmlFor="catalog-photo-upload">{t('admin.productPhoto')}</label>
              <div className="admin-image-upload-control">
                <input
                  id="catalog-photo-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={chooseImage}
                  disabled={busy}
                />
                <span className="field-hint">
                  {imageFile ? imageFile.name : t('admin.choosePhotoHint')}
                </span>
              </div>
            </div>
            <div className="catalog-image-preview">
              {!imageFailed && (imagePreview || imagePath) ? (
                <img
                  src={imagePreview || imagePath}
                  alt={product.name}
                  onError={() => setImageFailed(true)}
                />
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
