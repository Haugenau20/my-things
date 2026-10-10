import { expect, test } from '@playwright/test';
import { seedExamples, openFullView } from './fixtures';

test('desktop capture shares the panel, defaults to the room facet and retains a closed draft', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page
    .getByRole('group', { name: 'Room filter', exact: true })
    .getByRole('button', { name: /^Synthetic bedroom\s*3$/ })
    .click();
  await page.keyboard.press('n');
  const capture = page.getByRole('region', { name: 'Desktop capture', exact: true });
  await expect(capture).toBeVisible();
  await expect(capture).toContainText('Capturing in Synthetic bedroom');
  await expect(capture.getByRole('textbox', { name: 'Item name', exact: true })).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  for (const width of [1280, 1024, 851]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(capture).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const panel = await capture.boundingBox();
    expect(panel?.width).toBe(380);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: test.info().outputPath('desktop-capture.png'), fullPage: true });
  await capture
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic panel draft');
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(capture.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(
    'Synthetic panel draft',
  );
  await capture.getByRole('textbox', { name: 'Item name', exact: true }).press('Enter');
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic panel draft' }),
  ).toBeVisible();
  await expect(capture.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue('');
  await expect(capture.getByRole('textbox', { name: 'Item name', exact: true })).toBeFocused();
  await capture
    .getByRole('button', { name: 'Open recently added Synthetic panel draft', exact: true })
    .click();
  await expect(capture).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Item inspector', exact: true })).toContainText(
    'Synthetic panel draft',
  );
  const card = page
    .locator('.item-card')
    .filter({ has: page.getByRole('button', { name: 'Open Synthetic panel draft', exact: true }) });
  await expect(card.locator('.room-tag')).toHaveText('Synthetic bedroom');
  await page.getByRole('button', { name: 'Move to trash', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm move to trash', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Change saved' })).toBeVisible();
});

test('desktop optional details save atomically and Ctrl Enter marks only that capture reviewed', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const capture = page.getByRole('region', { name: 'Desktop capture', exact: true });
  await capture
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic detailed panel capture');
  await capture
    .locator('summary')
    .filter({ hasText: /^Details$/ })
    .click();
  await capture.getByLabel('Capture quantity').fill('3');
  await capture.getByLabel('Capture total estimated value').fill('0');
  await capture.getByLabel('Capture value currency').selectOption('JPY');
  await capture.getByLabel('Capture serial number').fill('0000021');
  await capture.getByLabel('Capture category').fill('Synthetic fragile');
  await capture.getByLabel('Capture notes').fill('Synthetic optional details');
  await capture.getByRole('textbox', { name: 'Item name', exact: true }).press('Control+Enter');
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic detailed panel capture' }),
  ).toBeVisible();
  await capture
    .getByRole('button', {
      name: 'Open recently added Synthetic detailed panel capture',
      exact: true,
    })
    .click();
  await openFullView(page);
  await expect(page.getByLabel('Quantity', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Total estimated value', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Serial number', { exact: true })).toHaveValue('0000021');
  await expect(page.getByLabel('Category', { exact: true })).toHaveValue('Synthetic fragile');
  await expect(page.getByRole('region', { name: 'Edit item' })).toContainText('Reviewed');
});

test('desktop photo drops retain their source selection when the capture panel closes', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const capture = page.getByRole('region', { name: 'Desktop capture', exact: true });
  const transfer = await page.evaluateHandle(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 6;
    canvas.getContext('2d')!.fillRect(0, 0, 8, 6);
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]!), (character) =>
      character.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], 'synthetic-drop.png', { type: 'image/png' }));
    return data;
  });
  await capture
    .getByRole('group', { name: 'Photo slot 1', exact: true })
    .dispatchEvent('drop', { dataTransfer: transfer });
  await capture
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic dropped capture');
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(capture.getByText('synthetic-drop.png', { exact: true })).toBeVisible();
  await expect(capture.getByRole('img', { name: 'Selected photo 1', exact: true })).toBeVisible();
  await capture.getByRole('textbox', { name: 'Item name', exact: true }).press('Enter');
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic dropped capture' }),
  ).toBeVisible();
});
