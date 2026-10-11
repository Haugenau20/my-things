import { expect, test } from '@playwright/test';

for (const kind of ['capture', 'attachment', 'recovery'] as const) {
  test(`${kind} acknowledgment remains truthful when inventory refresh rejects`, async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(async (kind) => {
      const path = '/tests/browser/photo-diagnostics-harness.ts';
      const harness = (await import(path)) as typeof import('./photo-diagnostics-harness');
      await harness.mountRefreshFailure(kind);
    }, kind);
    const harness = page.getByRole('region', { name: 'Synthetic diagnostic harness' });
    if (kind === 'capture') {
      await harness
        .getByRole('textbox', { name: 'Item name', exact: true })
        .fill('Synthetic acknowledged capture');
      await harness.getByRole('button', { name: 'Save & next', exact: true }).click();
    } else if (kind === 'attachment') {
      const png = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 8;
        canvas.height = 8;
        return canvas.toDataURL('image/png').split(',')[1]!;
      });
      await harness.getByLabel('Choose photos').setInputFiles({
        name: 'synthetic.png',
        mimeType: 'image/png',
        buffer: Buffer.from(png, 'base64'),
      });
      await harness.getByRole('button', { name: 'Save photos', exact: true }).click();
    } else {
      await harness.getByRole('button', { name: 'Verify & finish', exact: true }).click();
    }
    await expect(harness.getByRole('alert')).toContainText(
      'finished, but the inventory could not refresh',
    );
    await expect(harness.getByRole('alert')).not.toContainText(
      /private|token|inventories|unfinished/i,
    );
    await expect(
      harness.getByRole('button', { name: 'Copy diagnostics', exact: true }),
    ).toHaveCount(0);
    if (kind !== 'recovery') await expect(harness.getByRole('status')).toContainText(/Saved|saved/);
  });
}
