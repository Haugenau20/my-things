import { expect, test } from '@playwright/test';
import { seedExamples, openFullView } from './fixtures';

test('bulk actions appear only for selection, support ranges and leave room for the last row', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const bulk = page.getByRole('region', { name: 'Bulk editing', exact: true });
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  await expect(bulk).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Room filter', exact: true })
    .getByRole('button', { name: /^Synthetic bedroom\s*3$/ })
    .click();
  await page.getByLabel('Group by').selectOption('none');
  await page.getByLabel('Select Synthetic Linen sheets', { exact: true }).check();
  await page
    .getByLabel('Select Synthetic Wool blanket', { exact: true })
    .click({ modifiers: ['Shift'] });
  await expect(bulk).toContainText('3 selected');
  await expect(page.getByLabel('Select Synthetic Reading lamp', { exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(bulk).toHaveCount(0);
  await page.getByLabel('Select Synthetic Wool blanket', { exact: true }).check();
  await bulk.getByRole('button', { name: 'Select all 3 filtered', exact: true }).click();
  await expect(bulk).toContainText('3 selected');
  await bulk.getByRole('button', { name: 'Set room', exact: true }).click();
  await bulk.getByLabel('Bulk room').selectOption('seed-kitchen');
  await bulk.getByRole('button', { name: 'Apply to 3 selected', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '3 saved · 0 not saved' })).toBeVisible();
  await expect(bulk).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page
    .getByRole('group', { name: 'Room filter', exact: true })
    .getByRole('button', { name: /^Synthetic kitchen\s*5$/ })
    .click();
  await page.getByLabel('Select Synthetic Wool blanket', { exact: true }).check();
  await page.locator('.item-card').last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await page.locator('.item-card').last().boundingBox();
  const bar = await bulk.boundingBox();
  expect(last && bar && last.y + last.height <= bar.y).toBe(true);
  await page.screenshot({ path: test.info().outputPath('contextual-bulk.png'), fullPage: true });
  await bulk.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(bulk).toHaveCount(0);
});

test('contextual trash confirms and Restore preserves the moving outcome', async ({ page }) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByLabel('Search all items').fill('Picture');
  await page.getByLabel('Select Synthetic Picture frames', { exact: true }).check();
  const bulk = page.getByRole('region', { name: 'Bulk editing', exact: true });
  await bulk.getByRole('button', { name: 'Trash', exact: true }).click();
  await bulk.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await expect(
    bulk.getByRole('button', { name: 'Confirm bulk change', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }),
  ).toBeVisible();
  await bulk.getByRole('button', { name: 'Confirm bulk change', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 0 not saved' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Inventory views' })
    .getByRole('button', { name: 'Trash', exact: true })
    .click();
  await page.getByLabel('Select Synthetic Picture frames', { exact: true }).check();
  await expect(bulk.getByRole('button', { name: 'Trash', exact: true })).toHaveCount(0);
  await bulk.getByRole('button', { name: 'Restore', exact: true }).click();
  await bulk.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 0 not saved' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }),
  ).toHaveCount(0);
});

test('contextual category and pack/unpack actions preserve the room tag', async ({ page }) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByLabel('Search all items').fill('Picture');
  const bulk = page.getByRole('region', { name: 'Bulk editing', exact: true });
  await page.getByLabel('Select Synthetic Picture frames', { exact: true }).check();
  await bulk.getByRole('button', { name: 'Category', exact: true }).click();
  await bulk.getByLabel('Bulk category').fill('Synthetic fragile');
  await bulk.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 0 not saved' })).toBeVisible();
  await page.getByLabel('Select Synthetic Picture frames', { exact: true }).check();
  await bulk.getByRole('button', { name: 'Pack / unpack', exact: true }).click();
  await bulk.getByLabel('Bulk box').selectOption('seed-b001');
  await bulk.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  const card = page.locator('.item-card').filter({
    has: page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }),
  });
  await expect(card.locator('.box-tag')).toHaveText('B001');
  await expect(card.locator('.room-tag')).toHaveText('No room');
  await page.getByLabel('Select Synthetic Picture frames', { exact: true }).check();
  await bulk.getByRole('button', { name: 'Pack / unpack', exact: true }).click();
  await bulk.getByLabel('Bulk box').selectOption('');
  await bulk.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await expect(card.locator('.packing-text')).toHaveText('not packed');
  await page.getByRole('button', { name: 'Open Synthetic Picture frames', exact: true }).click();
  await openFullView(page);
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Synthetic fragile');
});
