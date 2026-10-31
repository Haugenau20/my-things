import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

test('review filtering keeps the inspector header and action controls in place', async ({
  page,
}) => {
  await seedExamples();
  await page.setViewportSize({ width: 1280, height: 1600 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('button', { name: /^Select \d+ filtered entries$/ })).toBeEnabled();
  await page
    .getByRole('navigation', { name: 'Inventory views' })
    .getByRole('button', { name: /^Review inbox/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Review inbox', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  const header = inspector.locator('.inspector-navigation');
  await expect(inspector.getByRole('button', { name: 'Open full view', exact: true })).toHaveText(
    '↗',
  );
  const close = inspector.getByRole('button', { name: 'Close inspector', exact: true });
  const review = inspector.getByRole('button', { name: 'Mark reviewed', exact: true });
  const store = inspector.getByRole('button', { name: 'Store', exact: true });
  for (const width of [1280, 1024, 851]) {
    await page.setViewportSize({ width, height: 1600 });
    const before = await Promise.all([
      header.boundingBox(),
      close.boundingBox(),
      store.boundingBox(),
      review.boundingBox(),
    ]);
    await review.click();
    await expect(inspector.getByRole('status').filter({ hasText: /^Reviewed$/ })).toBeVisible();
    await expect(header).toContainText('Outside current filters');
    await expect(
      inspector.getByRole('button', { name: 'Needs review', exact: true }),
    ).toBeEnabled();
    const after = await Promise.all([
      header.boundingBox(),
      close.boundingBox(),
      store.boundingBox(),
      review.boundingBox(),
    ]);
    expect(after[0]!.height).toBe(before[0]!.height);
    for (let index = 1; index < before.length; ++index) {
      expect(Math.abs(after[index]!.y - before[index]!.y)).toBeLessThan(0.5);
      expect(Math.abs(after[index]!.x - before[index]!.x)).toBeLessThan(0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath('outside-filter-' + width + '.png'),
      fullPage: true,
    });
    await inspector.getByRole('button', { name: 'Needs review', exact: true }).click();
    await expect(
      inspector.getByRole('status').filter({ hasText: /^Marked for review$/ }),
    ).toBeVisible();
    await expect(header).not.toContainText('Outside current filters');
  }
  await page.screenshot({
    path: test.info().outputPath('stable-inspector-header.png'),
    fullPage: true,
  });
  await inspector.getByRole('button', { name: 'Open full view', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Full item view', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await close.click();
  await expect(inspector).toHaveCount(0);
});
