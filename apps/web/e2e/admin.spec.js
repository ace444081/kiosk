import { expect, test } from '@playwright/test';
import {
  startOrder,
  addSimpleProduct,
  goToPayment,
  payWithCash,
  adminLogin,
  adminApiContext,
} from './helpers.js';

test.describe('admin console', () => {
  test('login rejects bad credentials generically and accepts good ones', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel(/Username/).fill('e2e-admin');
    await page.getByLabel(/Password/).fill('wrong-password');
    await page.getByRole('button', { name: /Sign in/ }).click();
    await expect(page.getByRole('alert')).toContainText(/Invalid username or password/);
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.getByLabel(/Password/).fill('e2e-pass-1234');
    await page.getByRole('button', { name: /Sign in/ }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test('dashboard shows today summary and the new order', async ({ page }) => {
    // Place an order from the kiosk first.
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await goToPayment(page);
    await payWithCash(page);
    const orderNumber = (await page.locator('.order-number').textContent()).trim();
    await page.context().clearCookies();

    await adminLogin(page);
    await expect(
      page.getByRole('heading', { name: /Operations and Sales|Operasyon at Benta/ }),
    ).toBeVisible();
    // Shared test DB: assert relative (at least) rather than exact counts.
    const totalOrders = await page
      .locator('.stat-card', { hasText: 'Total orders' })
      .locator('.stat-value')
      .textContent();
    expect(Number(totalOrders)).toBeGreaterThanOrEqual(1);
    const pendingCash = await page
      .locator('.stat-card', { hasText: 'Pending cash' })
      .locator('.stat-value')
      .textContent();
    expect(Number(pendingCash)).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.orders-table')).toContainText(orderNumber);
  });

  test('full order progression with cash confirmation', async ({ page }) => {
    const { ctx } = await adminApiContext();
    // Place + pay cash from the kiosk.
    await startOrder(page);
    await addSimpleProduct(page, 'Hashbrown', '₱65.00');
    await goToPayment(page);
    await payWithCash(page);
    const orderNumber = (await page.locator('.order-number').textContent()).trim();
    await page.context().clearCookies();

    await adminLogin(page);
    await page.getByRole('link', { name: /Orders|Mga Order/ }).click();
    await page.locator('.orders-table').getByText(orderNumber).click();
    await expect(page).toHaveURL(/\/admin\/orders\//);

    // Unpaid cash orders cannot start preparation.
    await expect(page.getByRole('button', { name: /Start preparing/ })).toBeDisabled();

    // Confirm cash, then placed -> preparing.
    await page.getByRole('button', { name: /Confirm cash received/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Confirm cash received/ })
      .click();
    await expect(page.locator('.badge-cash_received')).toBeVisible();

    await page.getByRole('button', { name: /Start preparing/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Start preparing/ })
      .click();
    await expect(page.locator('.badge-preparing')).toBeVisible();

    // preparing -> ready
    await page.getByRole('button', { name: /Mark ready/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Mark ready/ })
      .click();
    await expect(page.locator('.badge-ready')).toBeVisible();

    await page.getByRole('button', { name: /Complete|Kumpletuhin/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Complete|Kumpletuhin/ })
      .click();
    await expect(page.locator('.badge-completed')).toBeVisible();

    // The dashboard counts the completed order in completed sales (shared
    // DB means other tests may have completed orders too, so assert >= ₱65).
    await page.getByRole('link', { name: /Dashboard/ }).click();
    const salesText = await page
      .locator('.stat-card', { hasText: 'Completed sales' })
      .locator('.stat-value')
      .textContent();
    const salesValue = Number(salesText.replace(/[^0-9]/g, ''));
    expect(salesValue).toBeGreaterThanOrEqual(6500);
    await ctx.dispose();
  });

  test('admin filters and exact order-number search', async ({ page }) => {
    const { ctx, csrfToken } = await adminApiContext();
    // Create two orders via the API.
    const idem = () => `e2e-${Math.random().toString(36).slice(2, 14)}`;
    const payload = {
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'hashbrown-2pc', quantity: 1 }],
    };
    const a = await ctx.post('/api/v1/orders', {
      headers: { 'Idempotency-Key': idem() },
      data: payload,
    });
    const b = await ctx.post('/api/v1/orders', {
      headers: { 'Idempotency-Key': idem() },
      data: payload,
    });
    const orderA = (await a.json()).orderNumber;
    const orderB = (await b.json()).orderNumber;

    await adminLogin(page);
    await page.getByRole('link', { name: /Orders|Mga Order/ }).click();

    // Status filter: only placed orders.
    await page.locator('#order-status-filter').selectOption('placed');
    await expect(page.locator('.orders-table')).toContainText(orderA);
    await expect(page.locator('.orders-table')).toContainText(orderB);

    // Exact search finds exactly one.
    await page.locator('#order-search').fill(orderA);
    await expect(page.locator('.orders-table tbody tr')).toHaveCount(1);
    await expect(page.locator('.orders-table')).toContainText(orderA);
    await expect(page.locator('.orders-table')).not.toContainText(orderB);

    // Payment filter: pending_cash shows both again.
    await page.locator('#order-search').fill('');
    await page.locator('#order-payment-filter').selectOption('pending_cash');
    await expect(page.locator('.orders-table')).toContainText(orderB);

    // Advance one order to completed via API, then filter by completed.
    const detail = await ctx.get(`/api/v1/admin/orders?search=${orderA}`);
    expect(detail.status()).toBe(200);
    const detailBody = await detail.json();
    const order = detailBody.orders[0];
    let version = order.version;
    const cash = await ctx.patch(`/api/v1/admin/orders/${order.id}/payment`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { paymentStatus: 'cash_received', version },
    });
    const cashBody = await cash.json();
    version = cashBody.order.version;
    for (const status of ['preparing', 'ready']) {
      const step = await ctx.patch(`/api/v1/admin/orders/${order.id}/status`, {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { status, version },
      });
      const stepBody = await step.json();
      version = stepBody.order.version;
    }
    await ctx.patch(`/api/v1/admin/orders/${order.id}/status`, {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { status: 'completed', version },
    });

    await page.locator('#order-payment-filter').selectOption('');
    await page.locator('#order-status-filter').selectOption('completed');
    await expect(page.locator('.orders-table')).toContainText(orderA);
    await expect(page.locator('.orders-table')).not.toContainText(orderB);
    await ctx.dispose();
  });

  test('menu availability toggle reflects immediately in the kiosk', async ({ page }) => {
    await adminLogin(page);
    await page.getByRole('link', { name: /Menu/ }).click();

    // Search for the drip Americano (₱45) and mark it sold out.
    await page.locator('#product-search').fill('americano');
    const row = page
      .locator('.product-admin-card', { hasText: 'Americano' })
      .filter({ hasText: '₱45.00' })
      .first();
    await row.getByRole('button', { name: /Mark sold out/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Mark sold out/ })
      .click();
    await expect(row.locator('.badge-cancelled')).toContainText(/Sold out|Ubos na/);

    // The kiosk now shows the item disabled with a Sold out tag.
    const kiosk = await page.context().newPage();
    await kiosk.goto('/kiosk');
    await kiosk.getByRole('button', { name: /Start Order/ }).click();
    const card = kiosk
      .locator('.product-card', { hasText: 'Americano' })
      .filter({ hasText: '₱45.00' })
      .first();
    await expect(card.locator('.sold-out-tag')).toContainText(/Sold out|Ubos na/);
    await expect(card.getByRole('button', { name: /Add|Customize/ })).toHaveCount(0);
    await kiosk.close();

    // Re-enable from admin.
    await page.locator('#product-search').fill('americano');
    const rowAgain = page
      .locator('.product-admin-card', { hasText: 'Americano' })
      .filter({ hasText: '₱45.00' })
      .first();
    await rowAgain.getByRole('button', { name: /Mark available/ }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Mark available/ })
      .click();
    await expect(rowAgain.locator('.badge-completed')).toContainText(/Available/);
  });
});
