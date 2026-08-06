import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPeso } from '@kiosk/shared';
import { adminPost } from '../services/admin-api.js';

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
  addonIds: [],
  optionGroups: [],
};

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

function centsFromPeso(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
}

export function AdminProductFormDialog({ categories, addons, onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const productState = useMemo(() => {
    if (form.publication === 'available') return { isPublished: true, isAvailable: true };
    if (form.publication === 'unavailable') return { isPublished: true, isAvailable: false };
    return { isPublished: false, isAvailable: false };
  }, [form.publication]);

  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
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

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = await adminPost('/admin/products', {
        sku: form.sku.trim(),
        categoryId: form.categoryId,
        name: form.name.trim(),
        descriptionEn: form.descriptionEn.trim(),
        descriptionFil: form.descriptionFil.trim(),
        priceCentavos: centsFromPeso(form.price),
        imagePath: form.imagePath.trim(),
        sortOrder: Number.parseInt(form.sortOrder || '0', 10),
        ...productState,
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
      });
      onCreated(payload.product);
    } catch (err) {
      setError(err.message || t('admin.productCreateError'));
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
        aria-labelledby="new-product-title"
      >
        <div className="admin-dialog-heading">
          <div>
            <p className="admin-eyebrow">{t('admin.menu')}</p>
            <h2 id="new-product-title">{t('admin.addProduct')}</h2>
            <p>{t('admin.productFormIntro')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.close')}
          </button>
        </div>

        <form onSubmit={create} className="admin-product-form">
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
                  onChange={(event) => update('categoryId', event.target.value)}
                >
                  <option value="">{t('admin.selectCategory')}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.nameEn} / {category.nameFil}
                    </option>
                  ))}
                </select>
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
            </div>
          </fieldset>

          <fieldset>
            <legend>{t('admin.kioskCard')}</legend>
            <div className="admin-form-grid">
              <label className="admin-form-span">
                {t('admin.imageSource')}
                <input
                  required
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
              {form.imagePath && !imageFailed ? (
                <img src={form.imagePath} alt="" onError={() => setImageFailed(true)} />
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
              {busy ? t('common.loading') : t('admin.createProduct')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
