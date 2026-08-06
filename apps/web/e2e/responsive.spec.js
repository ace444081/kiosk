import { expect, test } from '@playwright/test';
import {
  startOrder,
  addSimpleProduct,
  goToReview,
  goToPayment,
  expectNoHorizontalOverflow,
  adminLogin,
} from './helpers.js';

const KIOSK_VIEWPORTS = [
  { name: 'kiosk-1024x600', width: 1024, height: 600 },
  { name: 'kiosk-1280x800', width: 1280, height: 800 },
  { name: 'kiosk-1366x768', width: 1366, height: 768 },
  { name: 'kiosk-768x1024-fallback', width: 768, height: 1024 },
];

const ADMIN_VIEWPORTS = [
  { name: 'admin-390x844-mobile', width: 390, height: 844 },
  { name: 'admin-1440x900-desktop', width: 1440, height: 900 },
];

test.describe('responsive layouts - no horizontal overflow', () => {
  for (const viewport of KIOSK_VIEWPORTS) {
    test(`kiosk menu has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/kiosk');
      await page.getByRole('button', { name: /Start Order|Simulan ang Order/ }).click();
      await expect(page).toHaveURL(/\/kiosk\/menu/);
      await expect(page.locator('.product-card').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`kiosk review has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await startOrder(page);
      await addSimpleProduct(page, 'Hashbrown', '₱65.00');
      await goToReview(page);
      await expectNoHorizontalOverflow(page);
    });

    test(`kiosk payment has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await startOrder(page);
      await addSimpleProduct(page, 'Hashbrown', '₱65.00');
      await goToPayment(page);
      await expect(page).toHaveURL(/\/kiosk\/payment/);
      await expectNoHorizontalOverflow(page);
    });
  }

  for (const viewport of ADMIN_VIEWPORTS) {
    test(`admin login has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/admin/login');
      await expect(page.getByRole('button', { name: /Sign in|Mag-sign in/ })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`admin dashboard has no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await adminLogin(page);
      await expect(page.locator('.stat-card').first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test('kiosk drawer cart works below 1024px', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    // The drawer trigger is visible below 1024px.
    const trigger = page.locator('.cart-drawer-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.locator('.cart-drawer .cart-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
