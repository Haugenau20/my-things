import { expect, test } from '@playwright/test';

test('workspace navigation starts at Things and keeps administrative tools in settings', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const navigation = page.getByRole('navigation', { name: 'Inventory views' });
  await expect(navigation.getByRole('button', { name: /^Things/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText('Backup export', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add a thing', exact: false })).toBeEnabled();
  await page.keyboard.press('n');
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic shell navigation');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(navigation.getByRole('button', { name: /^Review inbox/ })).toContainText(
    /Review inbox\s*\d+/,
  );
  await navigation.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await expect(page.getByText('Backup export', { exact: true })).toBeVisible();
  await expect(page.getByText('Restore backup', { exact: true })).toBeVisible();
  await expect(page.getByText('Photo maintenance', { exact: true })).toBeVisible();
  await navigation.getByRole('button', { name: /^Review inbox/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic shell navigation', exact: true }),
  ).toBeVisible();
  await navigation.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic shell navigation', exact: true }),
  ).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Manage rooms & boxes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Rooms and boxes' })).toBeVisible();
  await page.goBack();
  await expect(navigation.getByRole('button', { name: 'Trash', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await navigation.getByRole('button', { name: /^Things/ }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic retained draft');
  await page.getByRole('button', { name: 'Close capture', exact: true }).click();
  await navigation.getByRole('button', { name: /^Review inbox/ }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(
    'Synthetic retained draft',
  );
});

test('signed-out shell exposes no inventory and the seeded owner can sign in and out', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add a thing', exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('shell-desktop.png'), fullPage: true });
});

test('unrelated authenticated account is denied', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Test unauthorized account' }).click();
  await expect(page.getByRole('heading', { name: 'Access not granted' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
});

test('sign-out clears private content in another open tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(second.getByRole('navigation', { name: 'Inventory views' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(second.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
});

test('narrow screen retains accessible controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in as test owner' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('shell-mobile.png'), fullPage: true });
});

test('all backend requests stay within the loopback demo environment', async ({ page }) => {
  const unexpected: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) unexpected.push(url.origin);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('navigation', { name: 'Inventory views' })).toBeVisible();
  expect(unexpected).toEqual([]);
});
