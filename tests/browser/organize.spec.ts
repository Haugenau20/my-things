import { openFullView } from './fixtures';
import { expect, test } from '@playwright/test';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(() => expect(errors).toEqual([]));

test('desktop review, metadata search, packing, archive, and trash preserve meaning', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByLabel('Item name').fill('Synthetic organizing lamp');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }).click();
  await openFullView(page);
  await page.getByLabel('Serial number').fill('0000123');
  await page.getByLabel('Notes', { exact: true }).fill('<script>synthetic search needle</script>');
  await page.getByLabel('Quantity', { exact: true }).fill('7');
  await page.getByLabel('Total estimated value').fill('0');
  await page.getByLabel('Value currency', { exact: true }).selectOption('JPY');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Reviewed' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByLabel('Search all items').fill('SEARCH NEEDLE');
  await expect(
    page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('cell', { name: '0000123', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'JPY 0', exact: true })).toBeVisible();
  await page.getByLabel('Select Synthetic organizing lamp').check();
  await page
    .getByRole('region', { name: 'Bulk editing' })
    .getByRole('button', { name: 'Decision', exact: true })
    .click();
  await page.getByLabel('Bulk decision').selectOption('sell');
  await page.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved' })).toBeVisible();
  await page.getByLabel('Select Synthetic organizing lamp').check();
  await page
    .getByRole('region', { name: 'Bulk editing' })
    .getByRole('button', { name: 'Progress', exact: true })
    .click();
  await page.getByLabel('Bulk progress').selectOption('completed');
  await page.getByRole('button', { name: 'Apply to 1 selected', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm bulk change', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^Gone\s*\d+$/ })
    .click();
  await page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }).click();
  await openFullView(page);
  await expect(page.getByText('Room:', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }).click();
  await openFullView(page);
  await page.getByRole('button', { name: 'Restore item', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Restored' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByRole('button', { name: /^Things/ }).click();
  await page
    .getByRole('group', { name: 'Box filter', exact: true })
    .getByRole('button', { name: /^Gone\s*\d+$/ })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic organizing lamp', exact: true }),
  ).toBeVisible();
});

test('location labels use stable references, occupancy blocks archive, and filters survive detail navigation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByRole('button', { name: 'Manage rooms & boxes', exact: true }).click();
  const management = page.getByRole('region', { name: 'Rooms and boxes' });
  await management.getByLabel('New room name').fill('Synthetic M2 room');
  await management.getByRole('button', { name: 'Create room', exact: true }).click();
  await expect(management.getByRole('button', { name: 'Browse Synthetic M2 room' })).toBeVisible();
  await management.getByLabel('New box label').fill('B098');
  await management.getByRole('button', { name: 'Create box', exact: true }).click();
  await expect(management.getByRole('button', { name: 'Browse B098' })).toBeVisible();
  await page.getByRole('button', { name: /^Things/ }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page
    .getByLabel('Capture room', { exact: true })
    .selectOption({ label: 'Synthetic M2 room' });
  await page.getByLabel('Item name').fill('Synthetic packing record');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await page.getByRole('button', { name: 'Open Synthetic packing record', exact: true }).click();
  await openFullView(page);
  await page.getByLabel('Packing box').selectOption({ label: 'B098' });
  await page.getByRole('button', { name: 'Pack / unpack', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Packing saved' })).toBeVisible();
  await expect(page.getByText(/Room: Synthetic M2 room/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await page.getByRole('button', { name: 'Manage rooms & boxes', exact: true }).click();
  const box = management.getByRole('group', { name: 'Box B098' });
  const room = management.getByRole('group', { name: 'Room Synthetic M2 room', exact: true });
  await room.getByRole('button', { name: 'Load latest location', exact: true }).click();
  await room.getByLabel('Room name', { exact: true }).fill('Synthetic renamed M2 room');
  await room.getByRole('button', { name: 'Save location', exact: true }).click();
  await expect(
    management.getByRole('button', { name: 'Browse Synthetic renamed M2 room' }),
  ).toBeVisible();
  await box.getByRole('button', { name: 'Archive', exact: true }).click();
  await box.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(box.getByRole('alert')).toContainText('Move all current owned items');
  await management.getByRole('button', { name: 'Browse B098' }).click();
  await expect(
    page
      .getByRole('group', { name: 'Box filter', exact: true })
      .getByRole('button', { name: /^B098\s*\d+$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Open Synthetic packing record', exact: true }).click();
  await openFullView(page);
  await expect(page.getByText(/Room: Synthetic renamed M2 room/)).toBeVisible();
  await page.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(
    page
      .getByRole('group', { name: 'Box filter', exact: true })
      .getByRole('button', { name: /^B098\s*\d+$/ }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('two-tab bulk conflicts report each outcome without overwriting the newer details', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  for (const name of ['Synthetic conflicted item', 'Synthetic successful item']) {
    await page.getByLabel('Item name').fill(name);
    await page.getByRole('button', { name: 'Save & next', exact: true }).click();
    await expect(page.getByRole('button', { name: `Open ${name}`, exact: true })).toBeVisible();
  }
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sign in as test owner' }).click();
  await second.getByRole('button', { name: 'Open Synthetic conflicted item', exact: true }).click();
  await openFullView(second);
  await second.getByLabel('Notes', { exact: true }).fill('Newer details from another tab');
  await second.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(second.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible();
  await page.getByLabel('Select Synthetic conflicted item', { exact: true }).check();
  await page.getByLabel('Select Synthetic successful item', { exact: true }).check();
  await page
    .getByRole('region', { name: 'Bulk editing' })
    .getByRole('button', { name: 'Mark reviewed', exact: true })
    .click();
  await page.getByRole('button', { name: 'Apply to 2 selected', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 saved · 1 not saved' })).toBeVisible();
  await page.getByText('Per-item results', { exact: true }).click();
  await expect(
    page.getByText(/Synthetic conflicted item: This record changed elsewhere/),
  ).toBeVisible();
  await expect(page.getByLabel('Select Synthetic conflicted item', { exact: true })).toBeChecked();
  await expect(
    page.getByLabel('Select Synthetic successful item', { exact: true }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Open Synthetic conflicted item', exact: true }).click();
  await openFullView(page);
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue(
    'Newer details from another tab',
  );
  await expect(page.getByRole('region', { name: 'Edit item' })).toContainText('Needs review');
});

test('phone-width editing and currency defaults preserve existing amounts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await page.getByLabel('Item name').fill('Synthetic currency item');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await page.getByRole('button', { name: 'Open Synthetic currency item', exact: true }).click();
  await openFullView(page);
  await page.getByLabel('Total estimated value').fill('12.345');
  await page.getByLabel('Value currency', { exact: true }).selectOption('EUR');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('at most 2 decimal places');
  await page.getByLabel('Value currency', { exact: true }).selectOption('KWD');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Details saved' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Use this currency as inventory default', exact: true })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Default currency saved' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('organize-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Backup & settings', exact: true }).click();
  await page.getByText('Inventory settings', { exact: true }).click();
  await page.getByLabel('Default value currency').selectOption('JPY');
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /^Things/ }).click();
  await page.getByRole('button', { name: 'Open Synthetic currency item', exact: true }).click();
  await openFullView(page);
  await expect(page.getByLabel('Total estimated value')).toHaveValue('12.345');
  await expect(page.getByLabel('Value currency', { exact: true })).toHaveValue('KWD');
});
