import { PRODUCTS } from '@kiosk/shared';

export const PRODUCT_IMAGE_LIBRARY = PRODUCTS.map((product) => ({
  sku: product.sku,
  name: product.name,
  path: `/images/products/${product.sku}.webp`,
}));

const PRODUCT_IMAGE_BY_SKU = new Map(
  PRODUCT_IMAGE_LIBRARY.map((image) => [image.sku, image]),
);

export function generatedImageForSku(sku) {
  return PRODUCT_IMAGE_BY_SKU.get(String(sku || '').trim().toLowerCase())?.path || null;
}
