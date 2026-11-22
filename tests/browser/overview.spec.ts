import { expect, test } from '@playwright/test';
import { seedExamples, withSellingExamples } from './fixtures';

test('overview cells and single facets reuse Things counts and repeated navigation resets context', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const overview = () =>
    page
      .locator('.workspace-sidebar')
      .getByRole('button', { name: 'Where everything is', exact: true })
      .click();
  await overview();
  const region = page.getByRole('region', { name: 'Inventory overview', exact: true });
  await expect(region.getByRole('table')).toBeVisible();
  const cell = region.getByRole('button', {
    name: 'Browse Synthetic bedroom · B001: 1 things',
    exact: true,
  });
  await cell.focus();
  await expect(
    region.getByText('Synthetic bedroom · B001: 1 things', { exact: true }),
  ).toBeVisible();
  await cell.click();
  await expect(page.locator('.item-card')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Group by')).toHaveValue('none');
  await page.getByLabel('Search all items').fill('unmatched');
  await page.getByRole('button', { name: 'Clear Box filter', exact: true }).click();
  await page.getByLabel('Group by').selectOption('box');
  await overview();
  await cell.click();
  await expect(page.getByLabel('Search all items')).toHaveValue('');
  await expect(page.getByLabel('Group by')).toHaveValue('none');
  await expect(page.locator('.item-card')).toHaveCount(1);
  await page.getByLabel('Select Synthetic Reading lamp', { exact: true }).check();
  await overview();
  await cell.click();
  await expect(page.getByLabel('Select Synthetic Reading lamp', { exact: true })).not.toBeChecked();
  await overview();
  await region.getByRole('button', { name: 'Synthetic bedroom', exact: true }).click();
  await expect(page.locator('.item-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Clear Box filter', exact: true })).toHaveCount(0);
  await overview();
  await region.getByRole('button', { name: 'B002', exact: true }).click();
  await expect(page.locator('.item-card')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Clear Room filter', exact: true })).toHaveCount(0);
  await overview();
  await region
    .getByRole('button', { name: 'Browse Synthetic bedroom · Gone: 1 things', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Mirror', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.item-card')).toHaveCount(1);
  await overview();
  await region
    .getByRole('button', {
      name: 'Browse Synthetic old study (archived) · Not packed: 1 things',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Desk lamp', exact: true }),
  ).toBeVisible();
  await overview();
  const noRoom = region.getByRole('button', { name: /^Browse No room · Not packed: \d+ things$/ });
  const count = Number((await noRoom.getAttribute('aria-label'))!.match(/: (\d+) things/)![1]);
  await noRoom.click();
  await expect(page.locator('.item-card')).toHaveCount(count);
});

test('many overview boxes scroll inside the matrix while the Room column stays visible', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page
    .locator('.workspace-sidebar')
    .getByRole('button', { name: 'Manage rooms & boxes', exact: true })
    .click();
  for (let index = 0; index < 8; index++) {
    await page.getByLabel('New box label', { exact: true }).fill(`Synthetic overview box ${index}`);
    await page.getByRole('button', { name: 'Create box', exact: true }).click();
    await expect(page.getByLabel('New box label', { exact: true })).toHaveValue('');
  }
  await page
    .locator('.workspace-sidebar')
    .getByRole('button', { name: 'Where everything is', exact: true })
    .click();
  const scroll = page.getByLabel('Room by Box matrix', { exact: true });
  const first = scroll.getByRole('rowheader', { name: 'Synthetic bedroom', exact: true });
  const before = await first.boundingBox();
  expect(await scroll.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await scroll.evaluate((element) => {
    element.scrollLeft = 400;
  });
  const after = await first.boundingBox();
  expect(Math.abs(before!.x - after!.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('overview-matrix.png'), fullPage: true });
});

test('phone overview uses Room lists and its counts open matching facets', async ({ page }) => {
  await seedExamples();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const more = () =>
    page
      .getByRole('navigation', { name: 'Phone inventory views' })
      .getByRole('button', { name: 'More', exact: true })
      .click();
  await more();
  await page
    .getByRole('dialog', { name: 'More views' })
    .getByRole('button', { name: 'Where everything is', exact: true })
    .click();
  const region = page.getByRole('region', { name: 'Inventory overview', exact: true });
  await expect(region.getByRole('table')).toHaveCount(0);
  await expect(
    region.getByRole('article', { name: 'Synthetic old study (archived)', exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 850]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('overview-phone.png'), fullPage: true });
  await region
    .getByRole('button', { name: 'Browse Synthetic bedroom · B001: 1 things', exact: true })
    .click();
  await expect(page.locator('.item-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Clear Room filter', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear Box filter', exact: true })).toBeVisible();
});

test('selling totals sum sell values per currency and open the matching things', async ({
  page,
}) => {
  await seedExamples();
  await withSellingExamples(async () => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign in as test owner' }).click();
    const overview = () =>
      page
        .locator('.workspace-sidebar')
        .getByRole('button', { name: 'Where everything is', exact: true })
        .click();
    await overview();
    const selling = page.getByRole('region', { name: 'Selling totals', exact: true });
    const open = selling.getByRole('button', { name: /^Browse Still to sell: / });
    const sold = selling.getByRole('button', { name: /^Browse Sold so far: / });
    await expect(open).toHaveAttribute('aria-label', /CHF 150\.50/);
    await expect(open).toHaveAttribute('aria-label', /SEK 250\.00/);
    await expect(open).toHaveAttribute('aria-label', /without a value/);
    await expect(sold).toHaveAttribute('aria-label', /CHF 400\.00/);
    await expect(sold).not.toHaveAttribute('aria-label', /SEK/);
    await open.click();
    await expect(
      page.getByRole('button', { name: 'Clear Decision filter', exact: true }),
    ).toBeVisible();
    for (const name of ['chair', 'table', 'radio', 'kettle'])
      await expect(
        page.getByRole('button', { name: `Open Synthetic sale ${name}`, exact: true }),
      ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open Synthetic sold bicycle', exact: true }),
    ).toHaveCount(0);
    await overview();
    await sold.click();
    await expect(
      page.getByRole('button', { name: 'Open Synthetic sold bicycle', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Open Synthetic sale chair', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('navigation', { name: 'Phone inventory views' })
      .getByRole('button', { name: 'More', exact: true })
      .click();
    await page
      .getByRole('dialog', { name: 'More views' })
      .getByRole('button', { name: 'Where everything is', exact: true })
      .click();
    await expect(selling.getByRole('button')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: test.info().outputPath('overview-selling.png'), fullPage: true });
  });
});
