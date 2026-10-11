import { expect, test } from '@playwright/test';
import { openFullView } from './fixtures';

test('token photos retry media errors and clear from the app on sign-out', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const name = 'Synthetic token photo';
  await page.getByRole('textbox', { name: 'Item name', exact: true }).fill(name);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#263c32';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page
    .getByRole('region', { name: 'Desktop capture', exact: true })
    .getByLabel('Choose photos')
    .setInputFiles({
      name: 'synthetic-token.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
  let injected = false;
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    const url = new URL(route.request().url());
    if (!injected && url.searchParams.has('token') && url.pathname.endsWith('detail.jpg')) {
      injected = true;
      await route.fulfill({ status: 503, body: 'Synthetic media failure' });
    } else await route.continue();
  });
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await openFullView(page);
  await expect(page.getByRole('button', { name: 'Retry photo', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry photo', exact: true }).click();
  const image = page.getByRole('img', { name: `${name} · photo 1`, exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const url = (await image.getAttribute('src'))!;
  expect(new URL(url).searchParams.get('token')).toBeTruthy();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(image).toHaveCount(0);
  const anonymous = await browser.newContext();
  try {
    expect((await anonymous.request.get(url)).ok()).toBe(true);
  } finally {
    await anonymous.close();
  }
});
