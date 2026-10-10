import { expect, test } from '@playwright/test';

test('failed permanent photo deletion retains a marker and completes after reload/retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByLabel('Item name').fill('Synthetic permanent deletion');
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 40);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Choose photos').setInputFiles({
    name: 'synthetic.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Synthetic permanent deletion', exact: true })
    .click();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Delete permanently', exact: true }).click();
  const confirmation = page.getByRole('dialog', {
    name: 'Permanently delete Synthetic permanent deletion?',
  });
  await expect(confirmation).toContainText('cannot be restored from application trash');
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic denied cleanup"}}',
        })
      : route.continue(),
  );
  await confirmation
    .getByRole('button', { name: 'Confirm permanent deletion', exact: true })
    .click();
  await expect(confirmation.getByRole('alert')).toContainText('Deletion is unfinished');
  await confirmation.getByRole('button', { name: 'Close', exact: true }).click();
  const recovery = page.getByRole('region', { name: 'Unfinished permanent deletions' });
  await expect(recovery).toContainText('Synthetic permanent deletion');
  await expect(page.getByRole('region', { name: 'Unfinished captures' })).toHaveCount(0);
  await page.unrouteAll();
  await page.reload();
  await recovery.getByRole('button', { name: 'Retry permanent deletion', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Continue permanent deletion', exact: true })
    .click();
  await expect(recovery).toHaveCount(0);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Permanently deleted Synthetic permanent deletion' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic permanent deletion', exact: true }),
  ).toHaveCount(0);
});

test('orphan inspection is an explicit preview and has no deletion action', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Photo maintenance', { exact: true }).click();
  const preview = page.getByRole('region', { name: 'Orphan inspection' });
  await preview.getByRole('button', { name: 'Inspect stored photos', exact: true }).click();
  await expect(
    preview.getByRole('status').filter({ hasText: 'Inspection complete' }),
  ).toBeVisible();
  await expect(preview).toContainText('No objects were deleted');
  await expect(preview.getByRole('button', { name: /delete/i })).toHaveCount(0);
});
