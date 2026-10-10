import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

test('phone tabs expose every view and sign-out through More', async ({ page }) => {
  await seedExamples();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const tabs = page.getByRole('navigation', { name: 'Phone inventory views' });
  await expect(tabs).toBeVisible();
  await expect(page.locator('.workspace-sidebar')).not.toBeVisible();
  for (const name of [
    'Where everything is',
    'Manage rooms & boxes',
    'Trash',
    'Backup & settings',
  ]) {
    await tabs.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More views' })
      .getByRole('button', { name, exact: true })
      .click();
    await expect(page.getByRole('dialog', { name: 'More views' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await expect(page.getByText('Backup export', { exact: true })).toBeVisible();
  await tabs.getByRole('button', { name: /^Things/ }).click();
  await expect(page.getByRole('heading', { name: 'Your things', exact: true })).toBeVisible();
  for (const button of await tabs.getByRole('button').all())
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const add = page.getByRole('button', { name: '+ Add a thing', exact: false });
  const bounds = await add.boundingBox();
  const nav = await tabs.boundingBox();
  expect(bounds && nav && bounds.y + bounds.height <= nav.y).toBe(true);
  await page.screenshot({ path: test.info().outputPath('phone-tabs.png'), fullPage: true });
  await tabs.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'More views' })
    .getByRole('button', { name: 'Sign out', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
});

test('phone facet sheets share cross-counts and preserve full-view context', async ({ page }) => {
  await seedExamples();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: 'Choose Room filter', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Room picker' })
    .getByRole('button', { name: /^Synthetic bedroom\s*3$/ })
    .click();
  await expect(page.getByRole('dialog', { name: 'Room picker' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose Box filter', exact: true }).click();
  const box = page.getByRole('dialog', { name: 'Box picker' });
  await expect(box.getByRole('button', { name: /^Not packed\s*1$/ })).toBeVisible();
  await box.getByRole('button', { name: /^B001\s*1$/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }),
  ).toBeVisible();
  const card = page.locator('.item-card').filter({
    has: page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }),
  });
  await expect(card.locator('.box-tag')).toHaveText('B001');
  await expect(card.locator('.room-tag')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Item inspector' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Clear Room filter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear Box filter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear Box filter', exact: true }).click();
  for (const width of [320, 390, 850]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: test.info().outputPath('phone-browse.png'), fullPage: true });
});

test('phone cards are square in two columns and bulk results stay above tabs', async ({ page }) => {
  await seedExamples();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const cards = page.locator('.item-card');
  await expect(cards.first()).toBeVisible();
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first && second && first.y === second.y && first.x !== second.x).toBe(true);
  const thumb = await cards.first().locator('.thumbnail').boundingBox();
  expect(thumb && Math.abs(thumb.width - thumb.height) < 1).toBe(true);
  await page.getByLabel('Select Synthetic Wool blanket', { exact: true }).check();
  const bulk = page.getByRole('region', { name: 'Bulk editing', exact: true });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const last = await cards.last().boundingBox();
  const bar = await bulk.boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Phone inventory views' }).boundingBox();
  expect(last && bar && nav && last.y + last.height <= bar.y && bar.y + bar.height <= nav.y).toBe(
    true,
  );
  await bulk.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(bulk).toHaveCount(0);
});
