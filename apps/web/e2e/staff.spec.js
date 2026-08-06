import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.js';

const password = (role) => `e2e-${role}-1234`;

async function staffLogin(page, role) {
  await page.goto('/staff/login');
  await page.getByLabel('Username').fill(`e2e-${role}`);
  await page.getByLabel('Password').fill(password(role));
  await page.getByRole('button', { name: 'Open station' }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/${role}$`));
}

async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
}

test('cashier, kitchen, guest board, and serving complete one cash order', async ({
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
  await page.getByRole('button', { name: new RegExp(`#${shortNumber}`) }).click();
  await page.getByRole('button', { name: 'Confirm cash received' }).click();
  await expect(page.getByRole('status')).toContainText('Sent to kitchen');
  await logout(page);

  await staffLogin(page, 'kitchen');
  await page.getByRole('button', { name: new RegExp(`#${shortNumber}`) }).click();
  await page.getByRole('button', { name: 'Start preparing' }).click();
  await expect(page.getByText('On time', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`#${shortNumber}`) }).click();
  await page.getByRole('button', { name: 'Mark ready' }).click();
  await logout(page);

  const board = await page.context().newPage();
  await board.goto('/order-board');
  await expect(board.getByText(shortNumber, { exact: true })).toBeVisible();

  await staffLogin(page, 'serving');
  await page.getByRole('button', { name: new RegExp(`#${shortNumber}`) }).click();
  await page.getByRole('button', { name: 'Mark served' }).click();
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
    await expect(page.getByText('Select a ticket to continue')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await logout(page);
    await page.goto('/order-board');
    await expect(page.getByRole('button', { name: 'Enable sound & fullscreen' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
