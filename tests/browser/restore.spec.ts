import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { assertLocalTarget } from '../../scripts/safety';
import { LOCAL_ACCOUNTS } from '../../src/data/local-accounts';

test('validates without writes, refuses existing data, then resumes interrupted restore and opens its private JPEG', async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const photoName = 'Synthetic restore browser photo';
  await page.locator('.workspace-capture').getByLabel('Item name', { exact: true }).fill(photoName);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#2255aa';
    context.fillRect(0, 0, 80, 60);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page
    .getByRole('region', { name: 'Desktop capture', exact: true })
    .getByLabel('Choose photos')
    .setInputFiles({
      name: 'synthetic-restore.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open ${photoName}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Backup export', { exact: true }).click();
  const exportPanel = page.getByRole('region', { name: 'Full export' });
  await exportPanel.getByRole('button', { name: 'Start full export', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await exportPanel.getByRole('link', { name: /^Download inventory-/ }).click();
  const download = await downloadEvent;
  const buffer = await readFile((await download.path())!);
  const archive = { name: download.suggestedFilename(), mimeType: 'application/zip', buffer };
  await exportPanel
    .getByRole('button', { name: 'I saved the final ZIP and every photo part', exact: true })
    .click();
  await expect(exportPanel.getByRole('status')).toContainText('Export complete');
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Restore backup', { exact: true }).click();
  await page.getByLabel('Backup ZIP files').setInputFiles(archive);
  await page.getByRole('button', { name: 'Validate backup and destination', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Destination is not empty');
  await expect(
    page.getByRole('button', { name: 'Restore validated backup', exact: true }),
  ).toHaveCount(0);
  // Destructive fixture reset is restricted to the demo emulators and their known synthetic owner.
  assertLocalTarget('demo-inventory', process.env);
  const environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080 },
    storage: { host: '127.0.0.1', port: 19199 },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      expect((await db.doc('inventories/main').get()).data()?.ownerUid).toBe(
        LOCAL_ACCOUNTS.owner.uid,
      );
      for (const collection of ['items', 'rooms', 'boxes']) {
        const records = await db.collection(`inventories/main/${collection}`).get();
        const batch = db.batch();
        for (const record of records.docs) batch.delete(record.ref);
        await batch.commit();
      }
      const storage = context.storage('gs://demo-inventory.firebasestorage.app');
      const folders = [storage.ref('inventories/main/items')];
      while (folders.length) {
        const folder = folders.pop()!;
        const listing = await folder.listAll();
        folders.push(...listing.prefixes);
        await Promise.all(listing.items.map((file) => file.delete()));
      }
    });
  } finally {
    await environment.cleanup();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Restore backup', { exact: true }).click();
  await page.getByLabel('Backup ZIP files').setInputFiles(archive);
  await page.getByRole('button', { name: 'Validate backup and destination', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Backup restore' }).getByRole('status'),
  ).toContainText('No writes have occurred');
  await page.getByLabel('I confirm restore into main in local.').check();
  let denied = 0;
  await page.route('**/v0/b/**', async (route) => {
    if (route.request().method() === 'POST') {
      ++denied;
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":{"code":403,"message":"Synthetic denied upload"}}',
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Restore validated backup', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Import remains unfinished' }),
  ).toBeVisible();
  expect(denied).toBeGreaterThan(0);
  await expect(
    page.locator('.workspace-capture').getByLabel('Item name', { exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Backup export', { exact: true }).click();
  await expect(
    exportPanel.getByRole('button', { name: 'Start full export', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/v0/b/**');
  await page.reload();
  await expect(
    page.getByRole('alert').filter({ hasText: 'An import is unfinished' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Restore backup', { exact: true }).click();
  await page.getByLabel('Backup ZIP files').setInputFiles(archive);
  await page.getByRole('button', { name: 'Validate backup and destination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume restore', exact: true })).toBeVisible();
  await page.getByLabel('I confirm restore into main in local.').check();
  await page.getByRole('button', { name: 'Resume restore', exact: true }).click();
  // The seeded archive has 18 records and private photos to verify on a shared CI runner.
  await expect(
    page.getByRole('region', { name: 'Backup restore' }).getByRole('status'),
  ).toContainText('Restore complete', { timeout: 15000 });
  await expect(
    page.locator('.workspace-capture').getByLabel('Item name', { exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Restored item photo preview').selectOption({ label: photoName });
  const restoredPreview = page
    .getByRole('region', { name: 'Restored photo preview' })
    .getByRole('img', { name: `${photoName} · restored photo 1`, exact: true });
  await expect(restoredPreview).toBeVisible();
  await expect
    .poll(() => restoredPreview.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await restoredPreview.getAttribute('src')).toMatch(/^blob:/);
  await page.getByRole('button', { name: /^Things/ }).click();
  await page.getByRole('button', { name: `Open ${photoName}`, exact: true }).click();
  const image = page.getByRole('img', { name: `${photoName} · photo 1`, exact: true });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  expect(await image.getAttribute('src')).toMatch(/^blob:/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(image).toHaveCount(0);
  expect(errors).toEqual([]);
});
