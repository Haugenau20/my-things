import { expect, test } from '@playwright/test';
import { changeSyntheticNotes } from './fixtures';

test('metadata edits preserve gallery and inspector photos without more Storage requests', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    canvas.getContext('2d')!.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const names = ['Synthetic stable photo edited', 'Synthetic stable photo unchanged'];
  for (const name of names) {
    await page.getByRole('textbox', { name: 'Item name', exact: true }).fill(name);
    await page
      .getByRole('region', { name: 'Desktop capture', exact: true })
      .getByLabel('Choose photos')
      .setInputFiles({
        name: 'synthetic-stable.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
    await page.getByRole('button', { name: 'Save & next', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
  }
  // Drop capture previews and their leases so only the gallery/inspector are measured.
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search all items' }).fill('Synthetic stable photo');
  for (const name of names) {
    const image = page.locator('.item-card').getByRole('img', { name, exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: `Open ${names[0]}`, exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  const detail = inspector.getByRole('img', { name: `${names[0]} · photo 1`, exact: true });
  await expect
    .poll(() => detail.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const images = await page.locator('.item-card img, .item-detail-media img').elementHandles();
  expect(images).toHaveLength(3);
  let storageRequests = 0;
  // Routing disables the browser cache: any reissued URL or image fetch is counted.
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    ++storageRequests;
    await route.continue();
  });
  async function expectPhotosRetained() {
    await expect(page.getByText(/refreshing metadata/)).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: 'Store', exact: true })).toBeEnabled();
    expect(storageRequests).toBe(0);
    for (const image of images) expect(await image.evaluate((node) => node.isConnected)).toBe(true);
  }
  await inspector.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Decision saved' })).toBeVisible();
  await expectPhotosRetained();
  await inspector.getByRole('button', { name: 'In progress', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Progress saved' })).toBeVisible();
  await expectPhotosRetained();
  await inspector.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Reviewed' })).toBeVisible();
  await expectPhotosRetained();
  await page.getByRole('button', { name: 'Refresh inventory', exact: true }).click();
  await expectPhotosRetained();

  await changeSyntheticNotes(names[0]!, 'Synthetic concurrent edit');
  await inspector.getByRole('button', { name: 'Not started', exact: true }).click();
  await expect(inspector.getByRole('alert')).toContainText('changed elsewhere');
  await expectPhotosRetained();
});
