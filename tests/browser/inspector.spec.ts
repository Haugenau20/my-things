import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

test('desktop inspector leaves the filtered grid visible and navigates its items', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page
    .getByRole('group', { name: 'Room filter', exact: true })
    .getByRole('button', { name: /^Synthetic bedroom\s*3$/ })
    .click();
  await page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  await expect(inspector).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.item-card.is-inspected')).toContainText('Synthetic Reading lamp');
  await expect(inspector).toContainText('2 of 3');
  for (const width of [1280, 1024, 851]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await inspector.getByRole('heading', { name: 'Synthetic Reading lamp', exact: true }).click();
  await page.keyboard.press('j');
  await expect(
    inspector.getByRole('heading', { name: 'Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('k');
  await expect(
    inspector.getByRole('heading', { name: 'Synthetic Reading lamp', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Previous item', exact: true }).click();
  await expect(
    inspector.getByRole('heading', { name: 'Synthetic Linen sheets', exact: true }),
  ).toBeVisible();
  await inspector.getByRole('button', { name: 'Open full view', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.getByLabel('Notes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(
    page
      .getByRole('group', { name: 'Room filter', exact: true })
      .getByRole('button', { name: /^Synthetic bedroom\s*3$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await inspector.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await expect(inspector).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('inspector quick controls save on change and confirm completed disposal', async ({ page }) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  const room = inspector.getByRole('group', { name: 'Inspector room', exact: true });
  await room.getByRole('button', { name: 'Change', exact: true }).click();
  await room.getByLabel('Room tag').selectOption('seed-kitchen');
  await expect(inspector.getByRole('status').filter({ hasText: 'Room saved' })).toBeVisible();
  const box = inspector.getByRole('group', { name: 'Inspector box', exact: true });
  await box.getByRole('button', { name: 'Pack', exact: true }).click();
  await box.getByLabel('Packing box').selectOption('seed-b002');
  await expect(inspector.getByRole('status').filter({ hasText: 'Packing saved' })).toBeVisible();
  const progress = inspector.getByRole('group', { name: 'Moving progress', exact: true });
  await expect(progress.getByRole('button', { name: 'Completed', exact: true })).toBeDisabled();
  await inspector
    .getByRole('group', { name: 'Moving decision', exact: true })
    .getByRole('button', { name: 'Sell', exact: true })
    .click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Decision saved' })).toBeVisible();
  await progress.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(
    inspector.getByRole('button', { name: 'Confirm completion', exact: true }),
  ).toBeVisible();
  await expect(box).toContainText('B002');
  await inspector.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(progress.getByRole('button', { name: 'Not started', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await progress.getByRole('button', { name: 'Completed', exact: true }).click();
  await inspector.getByRole('button', { name: 'Confirm completion', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Change saved' })).toBeVisible();
  await expect(box).toContainText('Gone');
  await expect(room).toContainText('Synthetic kitchen');
  await page.screenshot({ path: test.info().outputPath('inspector-desktop.png'), fullPage: true });
});

test('a failed inspector edit reverts its control and preserves unsaved details until Load latest', async ({
  page,
  context,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  await inspector
    .locator('summary')
    .filter({ hasText: /^Details$/ })
    .click();
  await inspector.getByLabel('Notes', { exact: true }).fill('Unsaved synthetic details');
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sign in as test owner' }).click();
  await second.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await second.getByRole('button', { name: 'Open full view', exact: true }).click();
  await second.getByLabel('Notes', { exact: true }).fill('Newer synthetic details');
  await second.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(second.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible();
  const room = inspector.getByRole('group', { name: 'Inspector room', exact: true });
  await room.getByRole('button', { name: 'Change', exact: true }).click();
  await room.getByLabel('Room tag').selectOption('seed-kitchen');
  await expect(inspector.getByRole('alert')).toContainText('changed elsewhere');
  await expect(room.getByLabel('Room tag')).toHaveValue('seed-bedroom');
  await expect(inspector.getByLabel('Notes', { exact: true })).toHaveValue(
    'Unsaved synthetic details',
  );
  await inspector.getByRole('button', { name: 'Load latest details', exact: true }).click();
  await expect(inspector.getByLabel('Notes', { exact: true })).toHaveValue(
    'Newer synthetic details',
  );
});

test('phone opens the full item view and retains its facet context', async ({ page }) => {
  await seedExamples();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const room = page.getByRole('group', { name: 'Room filter', exact: true });
  await room.getByRole('button', { name: /^Synthetic bedroom\s*3$/ }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Item inspector', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Notes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(room.getByRole('button', { name: /^Synthetic bedroom\s*3$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
