import { expect, request as pwRequest } from '@playwright/test';

/** Start an order from the welcome screen (clears any previous session). */
export async function startOrder(page) {
  await page.goto('/kiosk');
  await page.getByRole('button', { name: /Start Order|Simulan ang Order/ }).click();
  await expect(page).toHaveURL(/\/kiosk\/menu/);
}

/** Find a product card by name + price, click its Add/Customize button. */
export async function openProduct(page, name, price) {
  const card = page.locator('.product-card', { hasText: name }).filter({ hasText: price }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /Add|Customize|I-customize|Idagdag/ }).click();
}

/** Add a simple product (no option groups) to the cart at qty 1. */
export async function addSimpleProduct(page, name, price) {
  await openProduct(page, name, price);
  // Simple products still go through the customize screen.
  await page.getByRole('button', { name: /Add to cart|Idagdag sa cart/ }).click();
  await expect(page).toHaveURL(/\/kiosk\/menu/);
}

/** Open the cart and land on review. Works with panel (>=1024px) and drawer (<1024px). */
export async function goToReview(page) {
  const drawerTrigger = page.locator('.cart-drawer-trigger');
  if (await drawerTrigger.isVisible()) {
    await drawerTrigger.click();
    await page
      .locator('.cart-drawer .cart-panel')
      .getByRole('button', { name: /Review order|Suriin ang order/ })
      .click();
  } else {
    await page
      .getByRole('button', { name: /Review order|Suriin ang order/ })
      .first()
      .click();
  }
  await expect(page).toHaveURL(/\/kiosk\/review/);
}

/** Go to review and continue to payment. Works with panel (>=1024px) and drawer (<1024px). */
export async function goToPayment(page) {
  const drawerTrigger = page.locator('.cart-drawer-trigger');
  if (await drawerTrigger.isVisible()) {
    await drawerTrigger.click();
    await page
      .locator('.cart-drawer .cart-panel')
      .getByRole('button', { name: /Review order|Suriin ang order/ })
      .click();
  } else {
    await page
      .getByRole('button', { name: /Review order|Suriin ang order/ })
      .first()
      .click();
  }
  await expect(page).toHaveURL(/\/kiosk\/review/);
  await page.getByRole('button', { name: /Continue to payment|Magpatuloy sa pagbabayad/ }).click();
  await expect(page).toHaveURL(/\/kiosk\/payment/);
}

/** Pay with cash and land on the confirmation screen. */
export async function payWithCash(page) {
  await page
    .getByRole('button', { name: /Place order — pay at counter|Mag-order — magbayad sa counter/ })
    .click();
  await expect(page).toHaveURL(/\/kiosk\/confirmation/);
}

/** Complete the full cash flow for a simple product. Returns the order number. */
export async function orderSimpleProductCash(page, name, price) {
  await startOrder(page);
  await addSimpleProduct(page, name, price);
  await goToPayment(page);
  await payWithCash(page);
  await expect(page.locator('.order-number')).toBeVisible();
  const orderNumber = (await page.locator('.order-number').textContent()).trim();
  expect(orderNumber).toMatch(/^SG-\d{8}-\d{3}$/);
  return orderNumber;
}

/** Authenticated admin API helper (own request context with session + CSRF). */
export async function adminApiContext({ baseURL = 'http://127.0.0.1:4173' } = {}) {
  const ctx = await pwRequest.newContext({ baseURL });
  const login = await ctx.post('/api/v1/admin/session', {
    data: { username: 'e2e-admin', password: 'e2e-pass-1234' },
  });
  expect(login.status()).toBe(200);
  const { csrfToken } = await login.json();
  return { ctx, csrfToken };
}

/** Log in through the admin UI. */
export async function adminLogin(page) {
  await page.goto('/admin/login');
  await page.getByLabel(/Username/).fill('e2e-admin');
  await page.getByLabel(/Password/).fill('e2e-pass-1234');
  await page.getByRole('button', { name: /Sign in|Mag-sign in/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Assert the page has no horizontal overflow. */
export async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1);
}
