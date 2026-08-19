import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.js';

const password = 'e2e-staff-1234';

async function staffLogin(page, station) {
  await page.goto(`/staff/login?station=${station}`);
  await page.getByLabel('Username').fill('e2e-staff');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Open workboard' }).click();
  await expect(page).toHaveURL(/\/staff\/operations/);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
}

test('one staff account can run cashier, kitchen, guest board, and serving', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/v1/orders', {
    headers: { 'Idempotency-Key': `e2e-staff-${Date.now()}` },
    data: {
      locale: 'en',
      paymentMethod: 'cash',
      items: [{ productId: 'americano', quantity: 1 }],
    },
  });
  expect(created.status()).toBe(201);
  const order = await created.json();
  const shortNumber = order.orderNumber.split('-').at(-1);

  await staffLogin(page, 'cashier');
  await page.getByRole('button', { name: new RegExp(`^Now #${shortNumber}\\b`) }).click();
  await page.getByRole('button', { name: 'Confirm cash received' }).click();
  await expect(page.getByRole('status')).toContainText('moved to preparation');
  await logout(page);

  await staffLogin(page, 'kitchen');
  await page.getByRole('button', { name: new RegExp(`^Now #${shortNumber}\\b`) }).click();
  await page.getByRole('button', { name: 'Start preparing' }).click();
  await expect(page.getByText(/^Preparing ·/)).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`^Now #${shortNumber}\\b`) }).click();
  await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
  await logout(page);

  const board = await page.context().newPage();
  await board.goto('/order-board');
  await expect(board.getByText(shortNumber, { exact: true })).toBeVisible();

  await staffLogin(page, 'serving');
  await page.getByRole('button', { name: new RegExp(`^Now #${shortNumber}\\b`) }).click();
  await page.getByRole('button', { name: 'Mark served', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('completed');
  await expect(board.getByText(shortNumber, { exact: true })).toBeVisible();
});

test('station and guest board remain usable on phone and tablet', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await staffLogin(page, 'kitchen');
    await expect(page.getByRole('button', { name: 'Sound off' })).toBeVisible();
    await expect(page.getByText('Select a ticket from any lane to continue')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await logout(page);
    await page.goto('/order-board');
    await expect(page.getByRole('button', { name: 'Enable sound & fullscreen' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
