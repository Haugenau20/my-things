import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedExamples, changeSyntheticNotes } from './fixtures';
async function owner(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
}
async function photo(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  return {
    name: 'synthetic-phone.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  };
}
test('phone photo-free loop keeps its room, saves to review and Undo moves to Trash', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  await expect(capture).toBeVisible();
  await expect(capture.getByRole('button', { name: 'Save as reviewed', exact: true })).toHaveCount(
    0,
  );
  await capture.getByRole('button', { name: 'Choose capture room', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Capture room picker' })
    .getByLabel('Capture room', { exact: true })
    .selectOption('seed-bedroom');
  await page.getByRole('button', { name: 'Close Capture room picker', exact: true }).click();
  await capture.getByRole('button', { name: 'No photo', exact: true }).click();
  await expect(capture.getByLabel('Item name', { exact: true })).toBeFocused();
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic phone loop');
  await capture.getByLabel('Item name', { exact: true }).press('Enter');
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic phone loop' }),
  ).toBeVisible();
  await expect(capture.getByRole('button', { name: 'Take photo', exact: true })).toBeVisible();
  await capture.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Moved Synthetic phone loop to Trash' }),
  ).toBeVisible();
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(capture.getByRole('button', { name: 'Choose capture room' })).toContainText(
    'Synthetic bedroom',
  );
  await page.reload();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(capture.getByRole('button', { name: 'Choose capture room' })).toContainText(
    'Synthetic bedroom',
  );
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Phone inventory views' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'More views' })
    .getByRole('button', { name: 'Trash', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open Synthetic phone loop', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Full item view' })).toContainText('Needs review');
});

test('phone uploads queue sequentially with no early saved toast or duplicate retry', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  let resume: (() => void) | undefined;
  let deny = true;
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    if (route.request().method() === 'POST') {
      if (!resume)
        await new Promise<void>((resolve) => {
          resume = resolve;
        });
      if (deny) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic denied upload"}}',
        });
        return;
      }
    }
    await route.continue();
  });
  await capture.getByLabel('Take a photo', { exact: true }).setInputFiles(await photo(page));
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic first queued phone');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect.poll(() => !!resume).toBe(true);
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic first queued phone' }),
  ).toHaveCount(0);
  await capture.getByRole('button', { name: 'No photo', exact: true }).click();
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic second queued phone');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(capture.getByRole('status').filter({ hasText: '2 captures pending' })).toBeVisible();
  resume!();
  await expect(
    capture.getByRole('alert').filter({ hasText: 'Synthetic first queued phone' }),
  ).toBeVisible();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic second queued phone' }),
  ).toHaveCount(0);
  deny = false;
  await capture.getByRole('button', { name: 'Retry queued capture', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic second queued phone' }),
  ).toBeVisible();
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic first queued phone', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Open Synthetic second queued phone', exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Open Synthetic first queued phone', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Full item view' })
      .getByRole('img', { name: 'Synthetic first queued phone' }),
  ).toBeVisible();
});

test('a full phone queue keeps the next name and blocks backup until acknowledged', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  let resume: (() => void) | undefined;
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    if (route.request().method() === 'POST' && !resume)
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    await route.continue();
  });
  await capture.getByLabel('Take a photo', { exact: true }).setInputFiles(await photo(page));
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic queue capacity first');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect.poll(() => !!resume).toBe(true);
  for (const name of ['Synthetic queue capacity second', 'Synthetic queue capacity third']) {
    await capture.getByRole('button', { name: 'No photo', exact: true }).click();
    await capture.getByLabel('Item name', { exact: true }).fill(name);
    await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  }
  await capture.getByRole('button', { name: 'No photo', exact: true }).click();
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic retained fourth');
  await expect(capture.getByRole('button', { name: 'Save & next', exact: true })).toBeDisabled();
  await expect(capture.getByLabel('Item name', { exact: true })).toHaveValue(
    'Synthetic retained fourth',
  );
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '3 captures pending' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Phone inventory views' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'More views' })
    .getByRole('button', { name: 'Backup & settings', exact: true })
    .click();
  await page.getByText('Backup export', { exact: true }).click();
  const start = page.getByRole('button', { name: 'Start full export', exact: true });
  await expect(start).toBeDisabled();
  resume!();
  await expect(start).toBeEnabled();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(capture.getByLabel('Item name', { exact: true })).toHaveValue(
    'Synthetic retained fourth',
  );
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic retained fourth' }),
  ).toBeVisible();
});

test('phone preparation failures retain the source and can return to name for a new selection', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  await capture.getByLabel('Choose photos', { exact: true }).setInputFiles({
    name: 'synthetic-invalid.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('synthetic invalid HEIC'),
  });
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic phone corrected source');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture
      .getByRole('alert')
      .filter({ hasText: 'Could not save Synthetic phone corrected source' }),
  ).toBeVisible();
  await capture.getByRole('button', { name: 'Edit failed capture', exact: true }).click();
  await expect(capture.getByLabel('Item name', { exact: true })).toHaveValue(
    'Synthetic phone corrected source',
  );
  await expect(capture.getByText('synthetic-invalid.heic', { exact: true })).toBeVisible();
  await capture.getByRole('button', { name: '‹ Retake', exact: true }).click();
  await capture.getByLabel('Choose photos', { exact: true }).setInputFiles(await photo(page));
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic phone corrected source' }),
  ).toBeVisible();
});

test('failed phone discard retains cleanup state and completes on an acknowledged retry', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  let denyDelete = true;
  await page.route('**/127.0.0.1:19199/**', (route) => {
    const method = route.request().method();
    if (
      (method === 'POST' && route.request().url().includes('detail.jpg')) ||
      (method === 'DELETE' && denyDelete)
    )
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":{"code":403,"message":"Synthetic failure"}}',
      });
    return route.continue();
  });
  await capture.getByLabel('Take a photo', { exact: true }).setInputFiles(await photo(page));
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic phone discarded');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture.getByRole('alert').filter({ hasText: 'Could not save Synthetic phone discarded' }),
  ).toBeVisible();
  await capture.getByRole('button', { name: 'Discard unfinished capture', exact: true }).click();
  await capture.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(capture.locator('.error-message')).toContainText(/unauthorized|permission/i);
  await expect(capture.getByRole('button', { name: 'Confirm discard', exact: true })).toBeEnabled();
  denyDelete = false;
  await capture.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(
    capture
      .getByRole('status')
      .filter({ hasText: 'Discarded unfinished Synthetic phone discarded' }),
  ).toBeVisible();
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Unfinished captures' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open Synthetic phone discarded', exact: true }),
  ).toHaveCount(0);
});

test('phone Undo refuses a stale revision and preserves the saved item for review', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  await capture.getByRole('button', { name: 'No photo', exact: true }).click();
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic phone Undo conflict');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic phone Undo conflict' }),
  ).toBeVisible();
  await changeSyntheticNotes('Synthetic phone Undo conflict', 'Synthetic newer notes');
  await capture.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(capture.getByRole('alert')).toContainText('Undo could not be confirmed');
  await capture.getByRole('button', { name: 'Open saved item', exact: true }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Synthetic newer notes');
  await expect(page.getByRole('button', { name: 'Move to trash', exact: true })).toBeVisible();
});

test('sign-out cancels queued phone work and suppresses any late private success', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  let resume: (() => void) | undefined;
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    if (route.request().method() === 'POST' && !resume)
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
    await route.continue();
  });
  await capture.getByLabel('Take a photo', { exact: true }).setInputFiles(await photo(page));
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic canceled phone queue');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect.poll(() => !!resume).toBe(true);
  await capture.getByRole('button', { name: 'No photo', exact: true }).click();
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic canceled waiting phone');
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await capture.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Phone inventory views' })
    .getByRole('button', { name: 'More', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'More views' })
    .getByRole('button', { name: 'Sign out', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  resume!();
  await expect(
    page.getByRole('status').filter({ hasText: /Saved Synthetic canceled/ }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Phone capture' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('region', { name: 'Unfinished captures' })).toContainText(
    'Synthetic canceled phone queue',
  );
  await expect(
    page.getByRole('button', { name: 'Open Synthetic canceled waiting phone', exact: true }),
  ).toHaveCount(0);
  const recovery = page.getByRole('region', { name: 'Unfinished captures' });
  await recovery.getByRole('button', { name: 'Discard unfinished capture', exact: true }).click();
  await recovery.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(recovery).toHaveCount(0);
});

test('phone name step appends a second photo and acknowledges both before the saved toast', async ({
  page,
}) => {
  await seedExamples();
  await owner(page);
  const capture = page.getByRole('region', { name: 'Phone capture', exact: true });
  await page.screenshot({ path: test.info().outputPath('phone-shoot.png') });
  await capture.getByLabel('Take a photo', { exact: true }).setInputFiles(await photo(page));
  await expect(capture.getByRole('button', { name: '+ 2nd photo', exact: true })).toBeVisible();
  await capture
    .getByLabel('Add second photo', { exact: true })
    .setInputFiles({ ...(await photo(page)), name: 'synthetic-second-phone.png' });
  await expect(capture.getByRole('img', { name: /Selected photo/ })).toHaveCount(2);
  await capture.getByLabel('Item name', { exact: true }).fill('Synthetic two-photo phone');
  for (const width of [320, 390, 850]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath('phone-name.png') });
  await capture.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    capture.getByRole('status').filter({ hasText: 'Saved Synthetic two-photo phone' }),
  ).toBeVisible();
  await expect(
    capture.getByRole('img', { name: 'Synthetic two-photo phone', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('phone-saved.png') });
  await capture
    .getByRole('button', { name: 'Open saved Synthetic two-photo phone', exact: true })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Full item view' })
      .getByRole('img', { name: /Synthetic two-photo phone · photo/ }),
  ).toHaveCount(2);
});
