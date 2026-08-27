import { test, expect } from '@playwright/test';
import { expectNoHorizontalOverflow } from './helpers.js';

const password = 'e2e-staff-1234';

async function staffLogin(page, station) {
  await page.goto(`/staff/login?station=${station}`);
  await page.getByLabel('Username').fill('e2e-staff');
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveAttribute(
    'type',
    'text',
  );
  await page.getByRole('button', { name: 'Hide password' }).click();
  await page.getByRole('button', { name: 'Open workboard' }).click();
  await expect(page).toHaveURL(/\/staff\/operations/);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/staff\/login$/);
}

function orderTicket(page, shortNumber) {
  return page.locator('.station-ticket').filter({ hasText: `#${shortNumber}` }).first();
}

async function selectOrder(page, shortNumber) {
  const solo = page.getByRole('button', { name: 'Solo priority' });
  await expect(solo).toBeVisible();
  // Solo priority intentionally shows only the next five items. Switch to
  // Team mode when a test needs a specific later ticket in the shared queue.
  if ((await solo.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: 'Team mode' }).click();
  }
  const ticket = orderTicket(page, shortNumber);
  await expect(ticket).toBeVisible();
  await ticket.getByRole('button').first().click();
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
  await selectOrder(page, shortNumber);
  await page.getByRole('button', { name: 'Confirm cash received' }).click();
  await expect(page.getByRole('status')).toContainText('moved to preparation');
  await logout(page);

  await staffLogin(page, 'kitchen');
  await selectOrder(page, shortNumber);
  await page.getByRole('button', { name: 'Start preparing' }).click();
  await expect(page.getByText(/^Preparing ·/)).toBeVisible();
  await selectOrder(page, shortNumber);
  await page.getByRole('button', { name: 'Mark ready', exact: true }).click();
  await logout(page);

  const board = await page.context().newPage();
  await board.goto('/order-board');
  await expect(board.getByText(shortNumber, { exact: true })).toBeVisible();

  await staffLogin(page, 'serving');
  await selectOrder(page, shortNumber);
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
