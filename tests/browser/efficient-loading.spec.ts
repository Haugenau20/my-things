import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { changeSyntheticNotes, seedExamples, setSyntheticDisplayName } from './fixtures';

// Firestore's WebChannel encodes listen targets as form data; decode to inspect query targets.
function firestoreBody(request: Request): string {
  const body = request.postData() ?? '';
  try {
    return decodeURIComponent(body.replace(/\+/g, ' '));
  } catch {
    return body;
  }
}
function isItemsQuery(request: Request) {
  if (!request.url().includes('127.0.0.1:18080')) return false;
  const body = firestoreBody(request);
  return body.includes('structuredQuery') && body.includes('"collectionId":"items"');
}

test('saves update the gallery without re-reading the inventory and listen for outside changes', async ({
  page,
}) => {
  await seedExamples();
  const queries: Request[] = [];
  page.on('request', (request) => {
    if (isItemsQuery(request)) queries.push(request);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  await expect(inspector.getByRole('button', { name: 'Store', exact: true })).toBeEnabled();
  // The initial load subscribes to the items collection once; that is the detection baseline.
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  queries.length = 0;
  await inspector.getByRole('button', { name: 'Store', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Decision saved' })).toBeVisible();
  await inspector.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await expect(inspector.getByRole('status').filter({ hasText: 'Reviewed' })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Store', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(queries).toHaveLength(0);
  // An outside change arrives through the listener and loads into the untouched editor.
  await changeSyntheticNotes('Synthetic Wool blanket', 'Synthetic live listener change');
  await expect(
    inspector.getByRole('status').filter({ hasText: 'Latest details loaded' }),
  ).toBeVisible();
  await inspector
    .locator('summary')
    .filter({ hasText: /^Details$/ })
    .click();
  await expect(inspector.getByLabel('Notes', { exact: true })).toHaveValue(
    'Synthetic live listener change',
  );
  expect(queries).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Refresh inventory' })).toHaveCount(0);
});

test('a broken live update offers Try again, which reloads once the record is valid', async ({
  page,
}) => {
  await seedExamples();
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
  try {
    await setSyntheticDisplayName('');
    await expect(page.getByRole('alert')).toContainText('Could not refresh inventory');
  } finally {
    await setSyntheticDisplayName('Synthetic inventory');
  }
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText('Could not refresh inventory')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open Synthetic Wool blanket', exact: true }),
  ).toBeVisible();
});

test('keep me signed in survives a new tab and is forgotten on sign-out', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Keep me signed in on this device').check();
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  // A new tab has no session storage; only the opted-in local sign-in carries over.
  const kept = await context.newPage();
  await kept.goto('/');
  await expect(kept.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await kept.close();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in as test owner' })).toBeVisible();
  await expect(page.getByLabel('Keep me signed in on this device')).not.toBeChecked();
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  const fresh = await context.newPage();
  await fresh.goto('/');
  await expect(fresh.getByRole('button', { name: 'Sign in as test owner' })).toBeVisible();
});

async function capture(page: Page, name: string, shade: string) {
  const png = await page.evaluate((fill) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d')!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1]!;
  }, shade);
  await page.getByRole('textbox', { name: 'Item name', exact: true }).fill(name);
  await page
    .getByRole('region', { name: 'Desktop capture', exact: true })
    .getByLabel('Choose photos')
    .setInputFiles({
      name: 'synthetic-efficient.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
}
const loaded = (page: Page, selector: string, name: string) =>
  expect
    .poll(() =>
      page
        .locator(selector)
        .getByRole('img', { name, exact: true })
        .evaluate((node) => (node as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);

test('photos reuse local captures, survive view changes and defer inspector detail downloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const names = ['Synthetic efficient first', 'Synthetic efficient second'] as const;
  let downloads = 0;
  page.on('request', (request) => {
    if (request.url().includes('127.0.0.1:19199') && request.method() === 'GET') ++downloads;
  });
  await capture(page, names[0], '#263c32');
  await capture(page, names[1], '#8a5a2b');
  // Uploads probe for existing objects first; only count requests after both saves finished.
  downloads = 0;
  await page.getByRole('button', { name: 'Close capture', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search all items' }).fill('Synthetic efficient');
  // Just-saved thumbnails come from the verified local bytes, not from Storage.
  for (const name of names) {
    await loaded(page, '.item-card', name);
    const source = await page
      .locator('.item-card')
      .getByRole('img', { name, exact: true })
      .getAttribute('src');
    expect(source).toMatch(/^blob:/);
  }
  expect(downloads).toBe(0);

  await page.reload();
  await page.getByRole('searchbox', { name: 'Search all items' }).fill('Synthetic efficient');
  for (const name of names) await loaded(page, '.item-card', name);
  const images = await page.locator('.item-card img').elementHandles();
  expect(images).toHaveLength(2);
  let storage = 0;
  // Routing disables the browser cache: every reissued URL or image fetch is counted.
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    ++storage;
    await route.continue();
  });
  await page
    .getByRole('navigation', { name: 'Inventory views' })
    .getByRole('button', { name: 'Where everything is' })
    .click();
  await expect(page.locator('.gallery-panel')).toBeHidden();
  await page
    .getByRole('navigation', { name: 'Inventory views' })
    .getByRole('button', { name: /^Things/ })
    .click();
  for (const name of names) await loaded(page, '.item-card', name);
  expect(storage).toBe(0);
  for (const image of images) expect(await image.evaluate((node) => node.isConnected)).toBe(true);

  // Stepping past an item before the dwell ends never requests its detail photo.
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('detail.jpg')) detailRequests.push(request.url());
  });
  await page.getByRole('button', { name: `Open ${names[1]}`, exact: true }).click();
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  await expect(inspector.getByRole('heading', { name: names[1] })).toBeVisible();
  await page.keyboard.press('j');
  await expect(inspector.getByRole('heading', { name: names[0] })).toBeVisible();
  const detail = inspector.getByRole('img', { name: `${names[0]} · photo 1`, exact: true });
  await expect.poll(() => detail.getAttribute('src')).toContain('detail.jpg');
  await expect
    .poll(() => detail.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // Only the item that stayed open fetched its detail derivative.
  const opened = detailRequests.map((url) => decodeURIComponent(url));
  expect(opened.length).toBeGreaterThan(0);
  const [first, second] = await Promise.all(
    names.map((name) =>
      page
        .locator('.item-card')
        .getByRole('img', { name, exact: true })
        .getAttribute('src')
        .then((src) => decodeURIComponent(src!).split('/photos/')[1]!.split('/')[0]!),
    ),
  );
  expect(opened.every((url) => url.includes(`/photos/${first}/`))).toBe(true);
  expect(opened.some((url) => url.includes(`/photos/${second}/`))).toBe(false);
});
