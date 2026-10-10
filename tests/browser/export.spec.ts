import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

async function selectPhoto(page: import('@playwright/test').Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 40);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Choose photos').setInputFiles({
    name: 'synthetic-export.png',
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
}
test('exports actual private photo bytes and photo-free records with independently verified checksums', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByLabel('Item name').fill('Synthetic export photo');
  await selectPhoto(page);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic export photo', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Item name').fill('Synthetic export without photo');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic export without photo', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Backup export', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Full export' });
  await panel.getByRole('button', { name: 'Start full export', exact: true }).click();
  const link = panel.getByRole('link', { name: /^Download inventory-/ });
  await expect(link).toBeVisible();
  await expect(page.getByLabel('Item name')).toBeDisabled();
  const confirmation = panel.getByRole('button', {
    name: 'I saved the final ZIP and every photo part',
    exact: true,
  });
  await expect(confirmation).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await link.click();
  const download = await downloadPromise;
  const payload = unzipSync(await readFile((await download.path())!));
  const manifest = JSON.parse(new TextDecoder().decode(payload['manifest.json'])) as {
    complete: boolean;
    files: { path: string; byteSize: number; sha256: string }[];
  };
  expect(manifest.complete).toBe(true);
  for (const file of manifest.files) {
    expect(payload[file.path]!.length).toBe(file.byteSize);
    expect(createHash('sha256').update(payload[file.path]!).digest('hex')).toBe(file.sha256);
  }
  const items = JSON.parse(new TextDecoder().decode(payload['items.json'])) as {
    name: string;
    photos: unknown[];
    coverPhotoId: string | null;
  }[];
  expect(items.find((item) => item.name === 'Synthetic export photo')?.photos).toHaveLength(1);
  expect(items.find((item) => item.name === 'Synthetic export without photo')).toMatchObject({
    photos: [],
    coverPhotoId: null,
  });
  await confirmation.click();
  await expect(panel.getByRole('status')).toContainText('Export complete');
  await expect(page.getByLabel('Item name')).toBeEnabled();
  expect(errors).toEqual([]);
});
test('cancellation releases export controls and sign-out clears the private download', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Backup export', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Full export' });
  await panel.getByRole('button', { name: 'Start full export', exact: true }).click();
  await expect(panel.getByRole('link', { name: /^Download inventory-/ })).toBeVisible();
  await panel.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('Export canceled');
  await expect(panel.getByRole('link')).toHaveCount(0);
  await expect(page.getByLabel('Item name')).toBeEnabled();
  await panel.getByRole('button', { name: 'Start full export', exact: true }).click();
  await expect(panel.getByRole('link', { name: /^Download inventory-/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Download inventory-/ })).toHaveCount(0);
});
test('export waits for an acknowledged capture before pausing mutations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Backup export', { exact: true }).click();
  const start = page.getByRole('button', { name: 'Start full export', exact: true });
  await expect(start).toBeEnabled();
  let resume: (() => void) | undefined;
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    if (route.request().method() === 'POST' && !resume)
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    await route.continue();
  });
  await page.getByRole('button', { name: /^Things/ }).click();
  await page.getByLabel('Item name').fill('Synthetic export capture barrier');
  await selectPhoto(page);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await expect(start).toBeDisabled();
  await expect.poll(() => !!resume).toBe(true);
  resume!();
  await expect(start).toBeEnabled();
  await page.getByRole('button', { name: /^Things/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic export capture barrier', exact: true }),
  ).toBeVisible();
});
