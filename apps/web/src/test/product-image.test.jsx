import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from '../components/KioskBits.jsx';
import { PRODUCT_IMAGE_LIBRARY, generatedImageForSku } from '../data/product-image-library.js';

describe('ProductImage', () => {
  it('keeps one generated asset per seeded SKU', () => {
    expect(PRODUCT_IMAGE_LIBRARY).toHaveLength(41);
    expect(new Set(PRODUCT_IMAGE_LIBRARY.map((image) => image.path)).size).toBe(41);
    expect(generatedImageForSku('espresso-cafe-latte')).toBe(
      '/images/products/espresso-cafe-latte.webp',
    );
  });

  it('prefers the generated catalog asset and falls back to the stored placeholder', () => {
    render(
      <ProductImage
        src="/placeholders/products/cafe-latte.svg"
        sku="espresso-cafe-latte"
        alt="Cafe Latte"
        width="600"
        height="400"
      />,
    );

    const image = screen.getByRole('img', { name: 'Cafe Latte' });
    expect(image).toHaveAttribute('src', '/images/products/espresso-cafe-latte.webp');

    fireEvent.error(image);
    expect(screen.getByRole('img', { name: 'Cafe Latte' })).toHaveAttribute(
      'src',
      '/placeholders/products/cafe-latte.svg',
    );

    fireEvent.error(screen.getByRole('img', { name: 'Cafe Latte' }));
    expect(screen.getByRole('img', { name: 'Cafe Latte' })).toHaveClass('product-image-fallback');
  });
});
