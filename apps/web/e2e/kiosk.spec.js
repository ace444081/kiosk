import { expect, test } from '@playwright/test';
import {
  startOrder,
  addSimpleProduct,
  goToPayment,
  payWithCash,
  adminApiContext,
} from './helpers.js';

test.describe('customer kiosk', () => {
  test('English cash order end to end', async ({ page }) => {
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await goToPayment(page);
    await payWithCash(page);

    const orderNumber = (await page.locator('.order-number').textContent()).trim();
    expect(orderNumber).toMatch(/^SG-\d{8}-\d{3}$/);
    await expect(page.getByText(/Please pay ₱65.00 at the counter/)).toBeVisible();
    await expect(page.locator('.receipt-print-area')).toContainText('2pc. Hashbrown');
    await expect(page.locator('.receipt-print-area')).toContainText('₱65.00');
  });

  test('Filipino cash order end to end', async ({ page }) => {
    await page.goto('/kiosk');
    await page.getByRole('button', { name: 'Filipino' }).click();
    await page.getByRole('button', { name: 'Simulan ang Order' }).click();
    await addSimpleProduct(page, 'Ube Latte', '₱59.00');
    await goToPayment(page);
    await payWithCash(page);

    await expect(page.locator('.order-number')).toBeVisible();
    await expect(page.getByText(/magbayad ng ₱59\.00 sa counter/i)).toBeVisible();
    // Receipt rendered in Filipino.
    await expect(page.locator('.receipt-print-area')).toContainText('Resibo');
    await expect(page.locator('.receipt-print-area')).toContainText('Ube Latte');
  });

  test('demo e-wallet order shows simulated warnings and DEMO reference', async ({ page }) => {
    await startOrder(page);
    await addSimpleProduct(page, 'Americano', '₱45.00');
    await goToPayment(page);

    await page.getByRole('button', { name: 'Demo E-Wallet' }).click();
    await expect(page.getByText('DEMO ONLY — NOT A REAL PAYMENT')).toBeVisible();
    await expect(page.locator('.demo-reference')).toContainText('DEMO-');
    await expect(page.getByAltText(/Demo QR/)).toBeVisible();

    await page.getByRole('button', { name: /Simulate e-wallet payment/ }).click();
    await expect(page).toHaveURL(/\/kiosk\/confirmation/);
    await expect(page.getByText(/DEMO E-WALLET PAYMENT — SIMULATED/)).toBeVisible();
    await expect(page.getByText(/recorded as SIMULATED/)).toBeVisible();
  });

  test('language change preserves the active cart', async ({ page }) => {
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    // Switch to Filipino from the menu header.
    await page.getByRole('button', { name: 'FIL' }).click();
    // Cart still holds the item and total in the (desktop) cart panel.
    await expect(page.locator('.cart-panel')).toContainText('2pc. Hashbrown');
    await expect(page.locator('.cart-panel')).toContainText('₱65.00');
    // Review in Filipino keeps the line item.
    await page
      .getByRole('button', { name: /Suriin ang order/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/kiosk\/review/);
    await expect(page.locator('.review-line', { hasText: '2pc. Hashbrown' })).toBeVisible();
    await expect(page.getByText('Kabuuan')).toBeVisible();
  });

  test('drink customization with add-on prices the line correctly', async ({ page }) => {
    await startOrder(page);
    await openProductWithOptions(page, 'Cafe Latte', '₱55.00');
    // Select the Espresso Shot add-on (₱35) and set quantity to 2.
    await page.getByText('Espresso Shot').click();
    await page.locator('.qty-stepper button').nth(1).click();
    // Line total: (55 + 35) x 2 = ₱180.00
    await expect(page.getByText('₱180.00').first()).toBeVisible();
    await page.getByRole('button', { name: /Add to cart/ }).click();
    await expect(page).toHaveURL(/\/kiosk\/menu/);
    await page
      .getByRole('button', { name: /Review order/ })
      .first()
      .click();
    await expect(page.getByText('Espresso Shot')).toBeVisible();
    await expect(page.getByText('₱180.00').first()).toBeVisible();
  });

  test('fries require a flavor choice (required option group)', async ({ page }) => {
    await startOrder(page);
    await openProductWithOptions(page, 'Crinkled Fries', '₱65.00');
    // Without a choice the add-to-cart action is disabled.
    await expect(page.getByRole('button', { name: /Add to cart/ })).toBeDisabled();
    // Choose Cheese.
    await page.getByText('Cheese', { exact: true }).click();
    await expect(page.getByRole('button', { name: /Add to cart/ })).toBeEnabled();
    await page.getByRole('button', { name: /Add to cart/ }).click();
    await expect(page).toHaveURL(/\/kiosk\/menu/);
    await page
      .getByRole('button', { name: /Review order/ })
      .first()
      .click();
    // The selected flavor appears in the review line meta ("Options: Cheese").
    await expect(page.locator('.review-line', { hasText: 'Crinkled Fries' })).toContainText(
      'Cheese',
    );
    // Fries without a flavor never reaches the server: server-side API test covers rejection.
  });

  test('cart edit and remove', async ({ page }) => {
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await addSimpleProduct(page, 'Ube Latte', '₱59.00');

    await page
      .getByRole('button', { name: /Review order/ })
      .first()
      .click();
    // Increase hashbrown quantity 1 -> 2.
    const hashbrownLine = page.locator('.review-line', { hasText: '2pc. Hashbrown' });
    await hashbrownLine.locator('.qty-stepper button').nth(1).click();
    await expect(hashbrownLine.locator('.review-line-total')).toHaveText('₱130.00');
    // Total becomes 130 + 59 = 189.
    await expect(page.locator('.review-totals .row.total')).toContainText('₱189.00');

    // Remove the ube latte.
    const ubeLine = page.locator('.review-line', { hasText: 'Ube Latte' });
    await ubeLine.getByRole('button', { name: /Remove|Alisin/ }).click();
    await expect(page.locator('.review-line', { hasText: 'Ube Latte' })).toHaveCount(0);
    await expect(page.locator('.review-totals .row.total')).toContainText('₱130.00');
  });

  test('idle timeout warns, then resets after 120 seconds', async ({ page }) => {
    await page.goto('/kiosk');
    await page.clock.install();
    await page.reload();
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');

    // 105s of inactivity -> warning overlay with a 15s countdown.
    await page.clock.fastForward(106_000);
    await expect(page.getByText('Are you still there?')).toBeVisible();
    // 120s total minus ~106s elapsed leaves ~14s of grace.
    await expect(page.getByText(/(14|15)s remaining/)).toBeVisible();

    // Continue keeps the session.
    await page.getByRole('button', { name: "I'm still here" }).click();
    await expect(page.getByText('Are you still there?')).toHaveCount(0);

    // A further 120s of inactivity resets to the welcome screen.
    await page.clock.fastForward(121_000);
    await expect(page).toHaveURL(/\/kiosk$/);
    await expect(page.getByRole('heading', { name: 'Welcome!' })).toBeVisible();
  });

  test('network failure before submission preserves cart and blocks checkout', async ({ page }) => {
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await goToPayment(page);

    // Simulate a dead server for the order mutation.
    await page.route('**/api/v1/orders', (route) => route.abort());
    await page.getByRole('button', { name: /Place order — pay at counter/ }).click();

    // Error shown; still on payment screen; cart preserved.
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page).toHaveURL(/\/kiosk\/payment/);

    // Server "recovers": the same idempotency key is reused on retry.
    await page.unroute('**/api/v1/orders');
    await page.getByRole('button', { name: /Place order — pay at counter/ }).click();
    await expect(page).toHaveURL(/\/kiosk\/confirmation/);
    await expect(page.locator('.order-number')).toBeVisible();
  });

  test('double-tap checkout creates exactly one order (idempotency)', async ({ page }) => {
    const { ctx } = await adminApiContext();
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await goToPayment(page);

    // Two synchronous submissions with the same idempotency key.
    await page
      .locator('.payment-method-card')
      .first()
      .getByRole('button')
      .evaluate((btn) => {
        btn.click();
        btn.click();
      });
    await expect(page).toHaveURL(/\/kiosk\/confirmation/);
    const orderNumber = (await page.locator('.order-number').textContent()).trim();

    const list = await ctx.get('/api/v1/admin/orders');
    expect(list.status()).toBe(200);
    const listBody = await list.json();
    const matches = listBody.orders.filter((o) => o.orderNumber === orderNumber);
    expect(matches.length).toBe(1);
    await ctx.dispose();
  });

  test('sold-out race: item sold out after adding to cart is rejected at checkout', async ({
    page,
  }) => {
    const { ctx, csrfToken } = await adminApiContext();

    await startOrder(page);
    await addSimpleProduct(page, 'Americano', '₱45.00');
    await goToPayment(page);

    // Mark the product sold out while the customer is at payment.
    const menu = await ctx.get('/api/v1/menu?locale=en');
    expect(menu.status()).toBe(200);
    const menuBody = await menu.json();
    const americano = menuBody.categories
      .flatMap((c) => c.products)
      .find((p) => p.id === 'americano');
    const patch = await ctx.patch('/api/v1/admin/products/americano/availability', {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { isAvailable: false, version: americano.version },
    });
    expect(patch.status()).toBe(200);
    const patchBody = await patch.json();
    await page.getByRole('button', { name: /Place order — pay at counter/ }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByText(/sold out/)).toBeVisible();
    // Still on the payment screen; the server never accepted the order.
    await expect(page).toHaveURL(/\/kiosk\/payment/);

    // Restore availability so later tests see the original menu.
    const restore = await ctx.patch('/api/v1/admin/products/americano/availability', {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { isAvailable: true, version: patchBody.product.version },
    });
    expect(restore.status()).toBe(200);
    await ctx.dispose();
  });
});

/** Open the customize screen for a product card (same as openProduct). */
async function openProductWithOptions(page, name, price) {
  const card = page.locator('.product-card', { hasText: name }).filter({ hasText: price }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Add|Customize|I-customize|Idagdag/ }).click();
  await expect(page).toHaveURL(/\/kiosk\/customize\//);
}
