import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function owner(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Add a thing' })).toBeVisible();
}
async function image(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#eee8d7';
    context.fillRect(0, 0, 900, 600);
    context.fillStyle = '#263c32';
    context.font = '48px sans-serif';
    context.fillText('SYNTHETIC LABEL 123', 50, 300);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  return {
    name: 'synthetic-label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(data, 'base64'),
  };
}
test('photo controls show camera and library buttons instead of native file buttons', async ({
  page,
}) => {
  await owner(page);
  const camera = page.getByRole('button', { name: 'Take photo', exact: true });
  await expect(camera).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await camera.click();
  await (await chooser).setFiles(await image(page));
  await expect(page.getByText(/Up to two photos · 1 selected/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photos', exact: true })).toBeVisible();
  await expect(page.getByLabel('Take a photo')).toBeHidden();
});
test('saves a name without photos, reloads, and attaches photos to the same item later', async ({
  page,
}) => {
  await owner(page);
  await page.getByLabel('Item name').fill('Synthetic desktop entry');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved Synthetic desktop entry' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Open Synthetic desktop entry', exact: true }).click();
  const detail = page.getByRole('region', { name: 'Saved inventory' });
  await expect(detail.getByText('No photo yet', { exact: true })).toBeVisible();
  await detail
    .getByLabel('Choose photos')
    .setInputFiles([
      await image(page),
      { ...(await image(page)), name: 'synthetic-later-second.png' },
    ]);
  await detail.getByRole('button', { name: 'Save photos', exact: true }).click();
  await expect(detail.getByRole('img', { name: /Synthetic desktop entry · photo/ })).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic desktop entry', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Synthetic desktop entry', exact: true }).click();
  await expect(page.getByRole('img', { name: /Synthetic desktop entry · photo/ })).toHaveCount(2);
});
test('sequential camera selections add photos instead of replacing the first one', async ({
  page,
}) => {
  await owner(page);
  const source = await image(page);
  await page.getByLabel('Take a photo').setInputFiles(source);
  await page
    .getByLabel('Take a photo')
    .setInputFiles({ ...source, name: 'synthetic-camera-second.png' });
  await expect(page.getByText(/Up to two photos · 2 selected/)).toBeVisible();
});
test('failed attachment cleanup remains retryable and never deletes the saved item', async ({
  page,
}) => {
  await owner(page);
  const name = 'Synthetic preserved desktop entry';
  await page.getByLabel('Item name').fill(name);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic failed attachment"}}',
        })
      : route.continue(),
  );
  const detail = page.getByRole('region', { name: 'Saved inventory' });
  await detail.getByLabel('Choose photos').setInputFiles(await image(page));
  await detail.getByRole('button', { name: 'Save photos', exact: true }).click();
  await expect(detail.getByRole('alert')).toContainText('Your item remains saved');
  await detail.getByRole('button', { name: 'Back to gallery', exact: true }).click();
  await expect(page.getByRole('button', { name: `Open ${name}`, exact: true })).toBeVisible();
  await page.unrouteAll();
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic failed cleanup"}}',
        })
      : route.continue(),
  );
  const recovery = page.getByRole('region', { name: 'Unfinished captures' });
  await recovery.getByRole('button', { name: 'Cancel photo attachment', exact: true }).click();
  await recovery.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(recovery.getByRole('alert')).toContainText('Cleanup is unfinished');
  await page.unrouteAll();
  await page.reload();
  await recovery.getByRole('button', { name: 'Retry cleanup', exact: true }).click();
  await recovery.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Open ${name}`, exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await expect(detail.getByText('No photo yet', { exact: true })).toBeVisible();
});
test('reload recovery attaches original files to a saved photo-free item', async ({ page }) => {
  await owner(page);
  const name = 'Synthetic attachment reselection';
  const source = await image(page);
  await page.getByLabel('Item name').fill(name);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic failed attachment"}}',
        })
      : route.continue(),
  );
  const detail = page.getByRole('region', { name: 'Saved inventory' });
  await detail.getByLabel('Choose photos').setInputFiles(source);
  await detail.getByRole('button', { name: 'Save photos', exact: true }).click();
  await expect(detail.getByRole('alert')).toContainText('Your item remains saved');
  await page.unrouteAll();
  await page.reload();
  const recovery = page.getByRole('region', { name: 'Unfinished captures' });
  await recovery.getByLabel(`Reselect originals for ${name}`).setInputFiles(source);
  await recovery.getByRole('button', { name: 'Verify & finish', exact: true }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Open ${name}`, exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
  const photo = page.getByRole('img', { name: `${name} · photo 1`, exact: true });
  await expect(photo).toBeVisible();
  await expect
    .poll(() =>
      photo.evaluate(
        (node) =>
          node instanceof HTMLImageElement &&
          node.complete &&
          node.naturalWidth > 0 &&
          node.src.startsWith('blob:'),
      ),
    )
    .toBe(true);
});
test('captures two photos, remembers the room, reloads private photos, and clears them on sign-out', async ({
  page,
}) => {
  await owner(page);
  await page.getByLabel('New room name').fill('Synthetic capture room');
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect(page.getByLabel('Capture room', { exact: true })).not.toHaveValue('');
  const roomId = await page.getByLabel('Capture room', { exact: true }).inputValue();
  await page.getByLabel('Item name').fill('Synthetic two-photo lamp');
  await page
    .getByLabel('Choose photos')
    .setInputFiles([await image(page), { ...(await image(page)), name: 'synthetic-second.png' }]);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved Synthetic two-photo lamp' }),
  ).toBeVisible();
  await expect(page.getByLabel('Item name')).toHaveValue('');
  await expect(page.getByLabel('Capture room', { exact: true })).toHaveValue(roomId);
  await page.reload();
  await page.getByRole('button', { name: 'Open Synthetic two-photo lamp', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic two-photo lamp' })).toBeVisible();
  const photos = page.getByRole('img', { name: /Synthetic two-photo lamp · photo/ });
  await expect(photos).toHaveCount(2);
  await expect
    .poll(() =>
      photos.evaluateAll((images) =>
        images.every(
          (img) =>
            img instanceof HTMLImageElement &&
            img.complete &&
            img.naturalWidth > 0 &&
            img.src.startsWith('blob:'),
        ),
      ),
    )
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath('capture-detail.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(photos).toHaveCount(0);
});
test('an interrupted upload stays unfinished and can be explicitly discarded after reload', async ({
  page,
}) => {
  await owner(page);
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic denied upload"}}',
        })
      : route.continue(),
  );
  await page.getByLabel('Item name').fill('Synthetic interrupted capture');
  await page.getByLabel('Choose photos').setInputFiles(await image(page));
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Capture is unfinished' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('storage/unauthorized');
  await expect(page.getByLabel('Item name')).toHaveValue('Synthetic interrupted capture');
  await page.unrouteAll();
  await page.reload();
  const recovery = page.getByRole('region', { name: 'Unfinished captures' });
  await expect(recovery.getByText('Synthetic interrupted capture', { exact: true })).toBeVisible();
  await recovery.getByRole('button', { name: 'Verify & finish' }).click();
  await expect(recovery.getByRole('alert')).toContainText('Reselect');
  await recovery.getByRole('button', { name: 'Discard unfinished capture', exact: true }).click();
  await recovery.getByRole('button', { name: 'Confirm discard', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic interrupted capture', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Unfinished captures' })).toHaveCount(0);
});
test('unsupported HEIC and too many photos preserve input without reporting saved', async ({
  page,
}) => {
  await owner(page);
  await page.getByLabel('Item name').fill('Synthetic undecodable item');
  await page.getByLabel('Choose photos').setInputFiles({
    name: 'synthetic.heic',
    mimeType: 'image/heic',
    buffer: Buffer.from('synthetic invalid HEIC'),
  });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('JPEG');
  await expect(page.getByLabel('Item name')).toHaveValue('Synthetic undecodable item');
  await page
    .getByLabel('Choose photos')
    .setInputFiles([await image(page), await image(page), await image(page)]);
  await expect(page.getByRole('alert')).toContainText('two photos');
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('two photos');
  await expect(
    page.getByRole('button', { name: 'Open Synthetic undecodable item', exact: true }),
  ).toHaveCount(0);
});

test('reload recovery accepts the original source and acknowledges completion', async ({
  page,
}) => {
  await owner(page);
  const source = await image(page);
  await page.route('**/127.0.0.1:19199/**', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: '{"error":{"code":403,"message":"Synthetic interruption"}}',
        })
      : route.continue(),
  );
  await page.getByLabel('Item name').fill('Synthetic recovered lamp');
  await page.getByLabel('Choose photos').setInputFiles(source);
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Capture is unfinished');
  await page.unrouteAll();
  await page.reload();
  const recovery = page.getByRole('region', { name: 'Unfinished captures' });
  await recovery
    .getByLabel('Reselect originals for Synthetic recovered lamp')
    .setInputFiles(source);
  await recovery.getByRole('button', { name: 'Verify & finish' }).click();
  await expect(
    page.getByRole('button', { name: 'Open Synthetic recovered lamp', exact: true }),
  ).toBeVisible();
  await expect(recovery).toHaveCount(0);
});
test('fresh JPEG derivatives strip metadata and normalize EXIF orientation without changing the source', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/media/processing.ts';
    const { preparePhoto, sha256 } = (await import(
      modulePath
    )) as typeof import('../../src/media/processing');
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#263c32';
    context.fillRect(0, 0, 120, 80);
    const jpeg = await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg'),
    );
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    // Minimal TIFF EXIF orientation 6, with an opaque synthetic metadata marker.
    const exif = new Uint8Array([
      69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const marker = new TextEncoder().encode('SYNTHETIC_PRIVATE_METADATA');
    const length = exif.length + marker.length + 2;
    const sourceBytes = new Uint8Array(bytes.length + length + 2);
    sourceBytes.set(bytes.slice(0, 2));
    sourceBytes.set([255, 225, length >> 8, length & 255], 2);
    sourceBytes.set(exif, 6);
    sourceBytes.set(marker, 6 + exif.length);
    sourceBytes.set(bytes.slice(2), length + 4);
    const source = new File([sourceBytes], 'synthetic-orientation.jpg', { type: 'image/jpeg' });
    const before = await sha256(new Uint8Array(await source.arrayBuffer()));
    const prepared = await preparePhoto(
      source,
      'main',
      'synthetic',
      'photo-one',
      new AbortController().signal,
    );
    const detail = new Uint8Array(await prepared.detail.arrayBuffer());
    const thumb = new Uint8Array(await prepared.thumbnail.arrayBuffer());
    const contains = (value: Uint8Array) =>
      new TextDecoder('latin1').decode(value).includes('Exif') ||
      new TextDecoder().decode(value).includes('SYNTHETIC_PRIVATE_METADATA');
    return {
      before,
      after: await sha256(new Uint8Array(await source.arrayBuffer())),
      dimensions: [prepared.photo.detail.width, prepared.photo.detail.height],
      thumbDimensions: [prepared.photo.thumbnail.width, prepared.photo.thumbnail.height],
      metadataRetained: contains(detail) || contains(thumb),
      detailHash: await sha256(detail),
      storedHash: prepared.photo.detail.sha256,
      type: prepared.detail.type,
    };
  });
  expect(result.before).toBe(result.after);
  expect(result.dimensions).toEqual([80, 120]);
  expect(result.thumbDimensions).toEqual([80, 120]);
  expect(result.metadataRetained).toBe(false);
  expect(result.detailHash).toBe(result.storedHash);
  expect(result.type).toBe('image/jpeg');
});
test('phone-width capture is usable and supports reviewed saves', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await owner(page);
  await page.getByLabel('Item name').fill('Synthetic reviewed phone item');
  await page.getByLabel('Choose photos').setInputFiles(await image(page));
  await page.getByRole('button', { name: 'Save as reviewed', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Saved Synthetic reviewed phone item' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open Synthetic reviewed phone item', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Saved inventory' })).toContainText('Reviewed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: test.info().outputPath('capture-mobile.png'), fullPage: true });
});
