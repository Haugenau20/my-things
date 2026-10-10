import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

test('group actions pack only visible items and retain independent card tags', async ({ page }) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const card = page.locator('.item-card').filter({
    has: page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  });
  await expect(card.locator('.room-tag')).toHaveText('Synthetic bedroom');
  await expect(card.locator('.packing-text')).toHaveText('not packed');
  await expect(card.getByRole('img', { name: 'Needs review', exact: true })).toBeVisible();
  await page.getByLabel('Group by').selectOption('box');
  await page.getByLabel('Search all items').fill('Wool');
  const group = page.getByRole('region', { name: 'Not packed', exact: true });
  await group.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(page.getByLabel('Select Synthetic Wool blanket', { exact: true })).toBeChecked();
  await group.getByRole('button', { name: 'Pack into box…', exact: true }).click();
  await group.getByRole('button', { name: 'Pack into B001', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 0 not saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^Not packed\s*\d+$/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Ceramic bowls', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  const packed = page.getByRole('region', { name: 'B001', exact: true });
  await packed.getByRole('button', { name: 'Open box', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'B001', exact: true, level: 2 })).toBeVisible();
  await expect(card.locator('.room-tag')).toHaveText('Synthetic bedroom');
  await expect(card.locator('.box-tag')).toHaveCount(0);
  for (const width of [1280, 1024, 851]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath('cards-grouped-desktop.png'),
    fullPage: true,
  });
});

test('group packing reports a stale item separately and leaves it selected', async ({
  page,
  context,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sign in as test owner' }).click();
  await second.getByRole('button', { name: 'Open Synthetic Linen sheets', exact: true }).click();
  await second.getByLabel('Packing box').selectOption('');
  await second.getByRole('button', { name: 'Pack / unpack', exact: true }).click();
  await expect(second.getByRole('status').filter({ hasText: 'Packing saved' })).toBeVisible();
  await second.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Refresh inventory', exact: true }).click();
  await page
    .getByRole('group', { name: 'Room filter', exact: true })
    .getByRole('button', { name: /^Synthetic bedroom\s*3$/ })
    .click();
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^Not packed\s*2$/ })
    .click();
  await page.getByLabel('Group by').selectOption('box');
  await second.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await second.getByLabel('Notes', { exact: true }).fill('Newer synthetic group details');
  await second.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(second.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible();
  const group = page.getByRole('region', { name: 'Not packed', exact: true });
  await group.getByRole('button', { name: 'Pack into box…', exact: true }).click();
  await group.getByRole('button', { name: 'Pack into B002', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 1 not saved' })).toBeVisible();
  await expect(
    page.getByText(/Synthetic Wool blanket: This record changed elsewhere/),
  ).toBeVisible();
  await expect(page.getByLabel('Select Synthetic Wool blanket', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
    'Newer synthetic group details',
  );
});

test('group packing can create an acknowledged box and warns for duplicate labels', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^Not packed\s*\d+$/ })
    .click();
  await page.getByLabel('Search all items').fill('Picture');
  const group = page.getByRole('region', { name: 'No room', exact: true });
  await group.getByRole('button', { name: 'Pack into box…', exact: true }).click();
  await group.getByLabel('New box label', { exact: true }).fill('B001');
  await group.getByRole('button', { name: 'Create box and pack', exact: true }).click();
  await expect(
    group.getByText('A box with this label already exists.', { exact: false }),
  ).toBeVisible();
  await group.getByLabel('New box label', { exact: true }).fill('B099');
  await group.getByRole('button', { name: 'Create box and pack', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 0 not saved' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^B099\s*1$/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }),
  ).toBeVisible();
});
