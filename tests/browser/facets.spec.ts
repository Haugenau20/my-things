import { expect, test } from '@playwright/test';
import { seedExamples } from './fixtures';

test('secondary popovers cross-filter both rows and Gone retains the room', async ({ page }) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const room = page.getByRole('group', { name: 'Room filter', exact: true });
  const box = page.getByRole('group', { name: 'Box filter', exact: true });
  await room.getByRole('button', { name: /Synthetic bedroom\s*3/ }).click();
  await page.getByRole('button', { name: 'Review ▾', exact: true }).click();
  await page
    .getByRole('group', { name: 'Review filter', exact: true })
    .getByRole('button', { name: 'needs review', exact: true })
    .click();
  await expect(page.getByRole('group', { name: 'Review filter', exact: true })).toHaveCount(0);
  await expect(box.getByRole('button', { name: /B001\s*0/ })).toBeVisible();
  await expect(box.getByRole('button', { name: /Gone\s*1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Decision ▾', exact: true }).click();
  await page
    .getByRole('group', { name: 'Decision filter', exact: true })
    .getByRole('button', { name: 'sell', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Mirror', exact: true }),
  ).toHaveCount(0);
  await box.getByRole('button', { name: /Gone\s*1/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Mirror', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear Decision filter', exact: true }).click();
  await page.getByRole('button', { name: 'Clear Review filter', exact: true }).click();
  await expect(room.getByRole('button', { name: /Synthetic bedroom\s*1/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('room and box chips combine, cross-count, retain context and clear selection', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const room = page.getByRole('group', { name: 'Room filter', exact: true });
  const box = page.getByRole('group', { name: 'Box filter', exact: true });
  await room.getByRole('button', { name: /Synthetic bedroom\s*3/ }).click();
  await expect(page.getByLabel('Group by')).toHaveValue('box');
  await box.getByRole('button', { name: /Not packed\s*1/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Reading lamp', exact: true }),
  ).toHaveCount(0);
  await expect(room.getByRole('button', { name: /Synthetic kitchen\s*1/ })).toBeVisible();
  await expect(box.getByRole('button', { name: /B002\s*1/ })).toBeVisible();
  await page.getByLabel('Select Synthetic Wool blanket', { exact: true }).check();
  await page.getByRole('button', { name: 'Clear Box filter', exact: true }).click();
  await expect(page.getByLabel('Select Synthetic Wool blanket', { exact: true })).not.toBeChecked();
  await page.getByLabel('Group by').selectOption('room');
  await box.getByRole('button', { name: /Not packed\s*1/ }).click();
  await expect(page.getByLabel('Group by')).toHaveValue('room');
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  await page.getByRole('button', { name: 'Close inspector', exact: true }).click();
  await expect(room.getByRole('button', { name: /Synthetic bedroom\s*1/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(box.getByRole('button', { name: /Not packed\s*1/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await room.getByRole('button', { name: /Synthetic old study \(archived\)\s*1/ }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Desk lamp', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  await page.keyboard.press('/');
  await expect(page.getByLabel('Search all items')).toBeFocused();
  await page.getByLabel('Search all items').fill('Spice');
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Spice jars', exact: true }),
  ).toBeVisible();
  await expect(room.getByRole('button', { name: /Synthetic bedroom\s*0/ })).toBeVisible();
});

test('secondary filter popovers list choices directly and close on outside click or Escape', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  const decision = page.getByRole('group', { name: 'Decision filter', exact: true });
  const progress = page.getByRole('group', { name: 'Progress filter', exact: true });
  await page.getByRole('button', { name: 'Decision ▾', exact: true }).click();
  await expect(decision.getByRole('button')).toHaveText([
    'Any decision',
    'undecided',
    'store',
    'take',
    'sell',
    'give away',
  ]);
  await expect(decision.getByRole('button', { name: 'Any decision', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Progress ▾', exact: true }).click();
  await expect(decision).toHaveCount(0);
  await expect(progress).toBeVisible();
  await page.getByRole('heading', { level: 2 }).first().click();
  await expect(progress).toHaveCount(0);
  await page.getByRole('button', { name: 'Decision ▾', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(decision).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Decision ▾', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'More ▾', exact: true }).click();
  await page.getByLabel('Missing photos', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'More · Missing photos ▾' })).toBeVisible();
  const toolbar = await page.locator('.browse-toolbar').boundingBox();
  const firstCard = await page.locator('.item-card').first().boundingBox();
  expect(firstCard!.y - (toolbar!.y + toolbar!.height)).toBeGreaterThanOrEqual(16);
});
