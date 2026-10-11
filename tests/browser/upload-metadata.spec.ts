import { expect, test } from '@playwright/test';

test('multipart and resumable uploads send empty custom metadata and retain failed captures', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    let seed = 123456789;
    for (let index = 0; index < pixels.data.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[index + channel] = seed >>> 24;
      }
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const requests: { protocol: string; metadata: Record<string, unknown> }[] = [];
  let release!: () => void;
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    const request = route.request();
    const headers = request.headers();
    const protocol = headers['x-goog-upload-protocol'];
    if (
      request.method() !== 'POST' ||
      (protocol !== 'multipart' &&
        !(protocol === 'resumable' && headers['x-goog-upload-command'] === 'start'))
    ) {
      await route.continue();
      return;
    }
    const metadata =
      protocol === 'multipart'
        ? (JSON.parse(
            request.postDataBuffer()!.toString('utf8').split('\r\n\r\n')[1]!.split('\r\n--')[0]!,
          ) as Record<string, unknown>)
        : (request.postDataJSON() as Record<string, unknown>);
    requests.push({ protocol, metadata });
    if (requests.length === 2) release();
    await bothStarted;
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: '{"error":{"code":403,"message":"Synthetic upload denial"}}',
    });
  });
  const name = 'Synthetic upload metadata retry';
  await page.getByRole('textbox', { name: 'Item name', exact: true }).fill(name);
  await page
    .getByRole('region', { name: 'Desktop capture', exact: true })
    .getByLabel('Choose photos')
    .setInputFiles({
      name: 'synthetic-noise.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('storage/unauthorized');
  expect(requests.map((request) => request.protocol).sort()).toEqual(['multipart', 'resumable']);
  for (const { metadata } of requests) {
    expect(metadata.contentType).toBe('image/jpeg');
    expect(metadata.cacheControl).toBe('private, no-store, max-age=0');
    expect(metadata.metadata).toEqual({});
  }
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(name);
  await expect(page.getByText(/Up to two photos · 1 selected/)).toBeVisible();
  const diagnostics = page.getByRole('button', { name: 'Copy diagnostics', exact: true });
  await diagnostics.click();
  await expect(page.getByRole('status').filter({ hasText: 'Diagnostics copied.' })).toBeVisible();
  // Windows clipboard text uses CRLF; the report fields stay identical across platforms.
  const report = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(report).toMatch(
    /^Photo operation diagnostics v1\nPhase: upload\nCode: storage\/unauthorized\nBuild: (local|[a-f0-9]{40})\nEnvironment: local$/,
  );
  expect(report).not.toMatch(/Synthetic|inventories|token|https:|127\.0\.0\.1/);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async () => {
        throw new Error('private clipboard failure');
      },
    }),
  );
  await diagnostics.click();
  await expect(
    page.getByText('Clipboard unavailable. Select and copy the report below.'),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Photo diagnostics report' })).toHaveValue(report);
  await expect(page.getByText('private clipboard failure')).toHaveCount(0);
  await page.unrouteAll();
  await page.getByRole('button', { name: 'Retry this capture', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved ${name}` })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Unfinished captures' })).toHaveCount(0);
  await expect(diagnostics).toHaveCount(0);
});

test('sign-out removes diagnostics even if a clipboard request resolves later', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in as test owner' }).click();
  await page.getByRole('button', { name: '+ Add a thing', exact: false }).click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.route('**/127.0.0.1:19199/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: '{"error":{"code":403,"message":"Synthetic denial"}}',
      });
    } else await route.continue();
  });
  await page
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill('Synthetic delayed diagnostics');
  await page
    .getByRole('region', { name: 'Desktop capture', exact: true })
    .getByLabel('Choose photos')
    .setInputFiles({
      name: 'synthetic.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    });
  await page.getByRole('button', { name: 'Save & next', exact: true }).click();
  const copy = page.getByRole('button', { name: 'Copy diagnostics', exact: true });
  await expect(copy).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            (
              globalThis as typeof globalThis & { finishSyntheticCopy?: () => void }
            ).finishSyntheticCopy = resolve;
          }),
      },
    });
  });
  await copy.click();
  await expect(copy).toBeDisabled();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your things, together.' })).toBeVisible();
  await page.evaluate(() =>
    (
      globalThis as typeof globalThis & { finishSyntheticCopy?: () => void }
    ).finishSyntheticCopy?.(),
  );
  await expect(copy).toHaveCount(0);
  await expect(page.getByText('Diagnostics copied.')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Photo diagnostics report' })).toHaveCount(0);
});
