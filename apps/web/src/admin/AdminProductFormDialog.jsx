import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BEVERAGE_CATEGORIES, formatPeso, SUGAR_LEVEL_GROUP } from '@kiosk/shared';
import { adminPatch, adminPost, adminUploadImage } from '../services/admin-api.js';

const initialForm = {
  sku: '',
  categoryId: '',
  name: '',
  descriptionEn: '',
  descriptionFil: '',
  price: '',
  imagePath: '',
  sortOrder: '0',
  publication: 'draft',
  stockQuantity: '',
  addonIds: [],
  optionGroups: [],
};

function formFromProduct(product) {
  if (!product) return { ...initialForm, addonIds: [], optionGroups: [] };
  return {
    ...initialForm,
    sku: product.sku,
    categoryId: product.categoryId,
    name: product.name,
    descriptionEn: product.descriptionEn || '',
    descriptionFil: product.descriptionFil || '',
    price: String(Number(product.priceCentavos || 0) / 100),
    imagePath: product.imagePath || '',
    sortOrder: String(product.sortOrder || 0),
    publication: !product.isPublished ? 'draft' : product.isAvailable ? 'available' : 'unavailable',
    stockQuantity: product.stockQuantity == null ? '' : String(product.stockQuantity),
    addonIds: [...(product.addonIds || [])],
    optionGroups: (product.optionGroups || []).map((group) => ({
      key: group.key,
      nameEn: group.nameEn,
      nameFil: group.nameFil,
      isRequired: Boolean(group.isRequired),
      minSelect: String(group.minSelect),
      maxSelect: String(group.maxSelect),
      options: (group.options || []).map((option) => ({
        nameEn: option.nameEn,
        nameFil: option.nameFil,
        price: String(Number(option.priceCentavos || 0) / 100),
      })),
    })),
  };
}

function newOptionGroup(index) {
  return {
    key: `choice-${index + 1}`,
    nameEn: 'Choice',
    nameFil: 'Pilian',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    options: [{ nameEn: 'Regular', nameFil: 'Regular', price: '0' }],
  };
}

function sugarOptionGroup() {
  return {
    key: SUGAR_LEVEL_GROUP.sku,
    nameEn: SUGAR_LEVEL_GROUP.nameEn,
    nameFil: SUGAR_LEVEL_GROUP.nameFil,
    isRequired: SUGAR_LEVEL_GROUP.isRequired,
    minSelect: SUGAR_LEVEL_GROUP.minSelect,
    maxSelect: SUGAR_LEVEL_GROUP.maxSelect,
    options: SUGAR_LEVEL_GROUP.options.map((option) => ({
      nameEn: option.nameEn,
      nameFil: option.nameFil,
      price: String(option.priceCentavos / 100),
    })),
  };
}

function centsFromPeso(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
}

export function AdminProductFormDialog({
  categories,
  addons,
  product = null,
  onClose,
  onCreated,
  onUpdated,
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => formFromProduct(product));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [productVersion, setProductVersion] = useState(product?.version || 1);

  const productState = useMemo(() => {
    if (form.publication === 'available') return { isPublished: true, isAvailable: true };
    if (form.publication === 'unavailable') return { isPublished: true, isAvailable: false };
    return { isPublished: false, isAvailable: false };
  }, [form.publication]);
  useEffect(
    () => () => {
      if (imagePreview && globalThis.URL?.revokeObjectURL) {
        globalThis.URL.revokeObjectURL(imagePreview);
      }
    },
    [imagePreview],
  );

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const updateCategory = (categoryId) => {
    setForm((previous) => ({
      ...previous,
      categoryId,
      optionGroups:
        BEVERAGE_CATEGORIES.has(categoryId) &&
        !previous.optionGroups.some((group) => group.key === SUGAR_LEVEL_GROUP.sku)
          ? [...previous.optionGroups, sugarOptionGroup()]
          : previous.optionGroups,
    }));
  };
  const updateGroup = (groupIndex, key, value) => {
    setForm((previous) => ({
      ...previous,
      optionGroups: previous.optionGroups.map((group, index) =>
        index === groupIndex ? { ...group, [key]: value } : group,
      ),
    }));
  };
  const updateOption = (groupIndex, optionIndex, key, value) => {
    setForm((previous) => ({
      ...previous,
      optionGroups: previous.optionGroups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              options: group.options.map((option, optIndex) =>
                optIndex === optionIndex ? { ...option, [key]: value } : option,
              ),
            }
          : group,
      ),
    }));
  };

  const toggleAddon = (addonId) => {
    setForm((previous) => ({
      ...previous,
      addonIds: previous.addonIds.includes(addonId)
        ? previous.addonIds.filter((id) => id !== addonId)
        : [...previous.addonIds, addonId],
    }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setImageFailed(false);
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
      const editorPayload = {
        categoryId: form.categoryId,
        name: form.name.trim(),
        descriptionEn: form.descriptionEn.trim(),
        descriptionFil: form.descriptionFil.trim(),
        priceCentavos: centsFromPeso(form.price),
        imagePath: form.imagePath.trim() || '/placeholders/logo.svg',
        sortOrder: Number.parseInt(form.sortOrder || '0', 10),
        ...productState,
        stockQuantity: form.stockQuantity === '' ? null : Number.parseInt(form.stockQuantity, 10),
        addonIds: form.addonIds,
        optionGroups: form.optionGroups.map((group) => ({
          key: group.key.trim(),
          nameEn: group.nameEn.trim(),
          nameFil: group.nameFil.trim(),
          isRequired: group.isRequired,
          minSelect: Number(group.minSelect),
          maxSelect: Number(group.maxSelect),
          options: group.options.map((option) => ({
            nameEn: option.nameEn.trim(),
            nameFil: option.nameFil.trim(),
            priceCentavos: centsFromPeso(option.price),
          })),
        })),
      };
      let savedProduct;
      if (product) {
        let version = productVersion;
        let imagePath = editorPayload.imagePath;
        if (imageFile) {
          const imagePayload = await adminUploadImage(
            `/admin/products/${product.id}/image`,
            imageFile,
            version,
          );
          savedProduct = imagePayload.product;
          version = savedProduct.version;
          imagePath = savedProduct.imagePath;
          setProductVersion(version);
        }
        const payload = await adminPatch(`/admin/products/${product.id}`, {
          ...editorPayload,
          imagePath,
          version,
        });
        savedProduct = payload.product;
        onUpdated(savedProduct);
      } else {
        const created = await adminPost('/admin/products', {
          sku: form.sku.trim(),
          ...editorPayload,
        });
        savedProduct = created.product;
        if (imageFile) {
          const imagePayload = await adminUploadImage(
            `/admin/products/${savedProduct.id}/image`,
            imageFile,
            savedProduct.version,
          );
          savedProduct = imagePayload.product;
        }
        onCreated(savedProduct);
      }
    } catch (err) {
      setError(
        err.message || (product ? t('admin.productUpdateError') : t('admin.productCreateError')),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop admin-form-backdrop" role="presentation">
      <section
        className="admin-product-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={product ? 'edit-product-title' : 'new-product-title'}
      >
        <div className="admin-dialog-heading">
          <div>
            <p className="admin-eyebrow">{t('admin.menu')}</p>
            <h2 id={product ? 'edit-product-title' : 'new-product-title'}>
              {product ? t('admin.editProduct') : t('admin.addProduct')}
            </h2>
            <p>{t('admin.productFormIntro')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>

        <form onSubmit={save} className="admin-product-form">
          <fieldset>
            <legend>{t('admin.productIdentity')}</legend>
            <div className="admin-form-grid">
              <label>
                {t('admin.productName')}
                <input
                  required
                  value={form.name}
                  onChange={(event) => update('name', event.target.value)}
                />
              </label>
              <label>
                {t('admin.productSku')}
                <input
                  required
                  value={form.sku}
                  readOnly={Boolean(product)}
                  disabled={Boolean(product)}
                  placeholder="baked-macaroni"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  onChange={(event) => update('sku', event.target.value.toLowerCase())}
                />
              </label>
              <label>
                {t('admin.category')}
                <select
                  required
                  value={form.categoryId}
                  onChange={(event) => updateCategory(event.target.value)}
                >
                  <option value="">{t('admin.selectCategory')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameEn} / {category.nameFil}
                    </option>
                  ))}
                </select>
                {BEVERAGE_CATEGORIES.has(form.categoryId) && (
                  <span className="field-hint">{t('admin.sugarLevelAuto')}</span>
                )}
              </label>
              <label>
                {t('admin.pricePeso')}
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => update('price', event.target.value)}
                />
              </label>
              <label>
                {t('admin.sortOrder')}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.sortOrder}
                  onChange={(event) => update('sortOrder', event.target.value)}
                />
              </label>
              <label>
                {t('admin.stockQuantity')}
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="1"
                  inputMode="numeric"
                  value={form.stockQuantity}
                  placeholder={t('admin.untrackedInventory')}
                  onChange={(event) => update('stockQuantity', event.target.value)}
                />
                <span className="field-hint">{t('admin.stockQuantityHint')}</span>
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('admin.kioskCard')}</legend>
            <div className="admin-form-grid">
              <label className="admin-form-span">
                {t('admin.imageSource')}
                <input
                  type="text"
                  placeholder="/images/menu-item.jpg or https://..."
                  value={form.imagePath}
                  onChange={(event) => {
                    setImageFailed(false);
                    update('imagePath', event.target.value);
                  }}
                />
                <span className="field-hint">{t('admin.imageSourceHint')}</span>
              </label>
              <div className="admin-image-upload admin-form-span">
                <label htmlFor="product-photo-upload">{t('admin.productPhoto')}</label>
                <div className="admin-image-upload-control">
                  <input
                    id="product-photo-upload"
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
              <label>
                {t('admin.descriptionEn')}
                <textarea
                  required
                  rows="3"
                  value={form.descriptionEn}
                  onChange={(event) => update('descriptionEn', event.target.value)}
                />
              </label>
              <label>
                {t('admin.descriptionFil')}
                <textarea
                  required
                  rows="3"
                  value={form.descriptionFil}
                  onChange={(event) => update('descriptionFil', event.target.value)}
                />
              </label>
            </div>
            <div className="product-preview" aria-live="polite">
              {(imagePreview || form.imagePath) && !imageFailed ? (
                <img
                  src={imagePreview || form.imagePath}
                  alt=""
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <div className="product-preview-placeholder">{t('admin.imagePreview')}</div>
              )}
              <div>
                <strong>{form.name || t('admin.productName')}</strong>
                <span>
                  {Number.isFinite(centsFromPeso(form.price))
                    ? formatPeso(centsFromPeso(form.price))
                    : '₱0.00'}
                </span>
                <p>{form.descriptionEn || t('admin.productPreviewHint')}</p>
              </div>
            </div>
            {imageFailed && <p className="field-error">{t('admin.imageUnavailable')}</p>}
          </fieldset>

          <fieldset>
            <legend>{t('admin.customization')}</legend>
            <p className="field-hint">{t('admin.customizationHint')}</p>
            {addons.length > 0 && (
              <div className="addon-picker">
                {addons.map((addon) => (
                  <label key={addon.id}>
                    <input
                      type="checkbox"
                      checked={form.addonIds.includes(addon.id)}
                      onChange={() => toggleAddon(addon.id)}
                    />
                    <span>
                      {addon.nameEn} / {addon.nameFil} · {formatPeso(addon.priceCentavos)}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="option-group-list">
              {form.optionGroups.map((group, groupIndex) => (
                <section className="option-group-editor" key={`${group.key}-${groupIndex}`}>
                  <div className="option-group-heading">
                    <h3>
                      {t('admin.choiceGroup')} {groupIndex + 1}
                    </h3>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        update(
                          'optionGroups',
                          form.optionGroups.filter((_, index) => index !== groupIndex),
                        )
                      }
                    >
                      {t('common.remove')}
                    </button>
                  </div>
                  <div className="admin-form-grid">
                    <label>
                      {t('admin.groupKey')}
                      <input
                        value={group.key}
                        onChange={(event) =>
                          updateGroup(groupIndex, 'key', event.target.value.toLowerCase())
                        }
                      />
                    </label>
                    <label>
                      {t('admin.groupNameEn')}
                      <input
                        value={group.nameEn}
                        onChange={(event) => updateGroup(groupIndex, 'nameEn', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('admin.groupNameFil')}
                      <input
                        value={group.nameFil}
                        onChange={(event) => updateGroup(groupIndex, 'nameFil', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('admin.minSelect')}
                      <input
                        type="number"
                        min="0"
                        max="10"
                        value={group.minSelect}
                        onChange={(event) =>
                          updateGroup(groupIndex, 'minSelect', event.target.value)
                        }
                      />
                    </label>
                    <label>
                      {t('admin.maxSelect')}
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={group.maxSelect}
                        onChange={(event) =>
                          updateGroup(groupIndex, 'maxSelect', event.target.value)
                        }
                      />
                    </label>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={group.isRequired}
                        onChange={(event) =>
                          updateGroup(groupIndex, 'isRequired', event.target.checked)
                        }
                      />
                      {t('admin.required')}
                    </label>
                  </div>
                  {group.options.map((option, optionIndex) => (
                    <div className="option-editor-row" key={optionIndex}>
                      <input
                        aria-label={t('admin.optionNameEn')}
                        value={option.nameEn}
                        onChange={(event) =>
                          updateOption(groupIndex, optionIndex, 'nameEn', event.target.value)
                        }
                      />
                      <input
                        aria-label={t('admin.optionNameFil')}
                        value={option.nameFil}
                        onChange={(event) =>
                          updateOption(groupIndex, optionIndex, 'nameFil', event.target.value)
                        }
                      />
                      <input
                        aria-label={t('admin.optionPrice')}
                        type="number"
                        min="0"
                        step="0.01"
                        value={option.price}
                        onChange={(event) =>
                          updateOption(groupIndex, optionIndex, 'price', event.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={group.options.length === 1}
                        onClick={() =>
                          updateGroup(
                            groupIndex,
                            'options',
                            group.options.filter((_, index) => index !== optionIndex),
                          )
                        }
                      >
                        {t('common.remove')}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      updateGroup(groupIndex, 'options', [
                        ...group.options,
                        { nameEn: '', nameFil: '', price: '0' },
                      ])
                    }
                  >
                    {t('admin.addChoice')}
                  </button>
                </section>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                update('optionGroups', [
                  ...form.optionGroups,
                  newOptionGroup(form.optionGroups.length),
                ])
              }
            >
              {t('admin.addChoiceGroup')}
            </button>
          </fieldset>

          <fieldset>
            <legend>{t('admin.publicationState')}</legend>
            <div className="publication-choice">
              <label>
                <input
                  type="radio"
                  name="publication"
                  value="draft"
                  checked={form.publication === 'draft'}
                  onChange={(event) => update('publication', event.target.value)}
                />
                {t('admin.saveAsDraft')}
              </label>
              <label>
                <input
                  type="radio"
                  name="publication"
                  value="unavailable"
                  checked={form.publication === 'unavailable'}
                  onChange={(event) => update('publication', event.target.value)}
                />
                {t('admin.publishUnavailable')}
              </label>
              <label>
                <input
                  type="radio"
                  name="publication"
                  value="available"
                  checked={form.publication === 'available'}
                  onChange={(event) => update('publication', event.target.value)}
                />
                {t('admin.publishAvailable')}
              </label>
            </div>
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
              {busy
                ? t('common.loading')
                : product
                  ? t('admin.saveProduct')
                  : t('admin.createProduct')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
