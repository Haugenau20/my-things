import { expect, test } from '@playwright/test';

test('signed-out shell exposes no inventory and the seeded owner can sign in and out', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add a thing' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('shell-desktop.png'), fullPage: true });
});

test('unrelated authenticated account is denied', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Test unauthorized account' }).click();
  await expect(page.getByRole('heading', { name: 'Access not granted' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
});

test('sign-out clears private content in another open tab', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toBeVisible();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(second.getByRole('heading', { name: 'Synthetic inventory' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Synthetic inventory' })).toBeVisible();
  expect(unexpected).toEqual([]);
});
