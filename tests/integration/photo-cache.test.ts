import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { assertLocalTarget } from '../../scripts/safety';
import { jsonApiTransport, migratePhotoCache } from '../../scripts/photo-cache';
import { LEGACY_PHOTO_CACHE, PHOTO_CACHE } from '../../src/media/cache-policy';

const BUCKET = 'demo-inventory.firebasestorage.app';
let environment: RulesTestEnvironment;
beforeAll(async () => {
  assertLocalTarget('demo-inventory', process.env);
  environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    storage: { host: '127.0.0.1', port: 19199, rules: await readFile('storage.rules', 'utf8') },
  });
});
afterAll(async () => {
  await environment?.cleanup();
});

it('migrates legacy photo metadata in the emulator without changing bytes or download URLs', async () => {
  const inventory = 'cache-migration';
  const paths = ['detail', 'thumb'].map(
    (variant) => `inventories/${inventory}/items/item-a/photos/photo-a/${variant}.jpg`,
  );
  const unexpected = `inventories/${inventory}/items/item-a/notes.txt`;
  const bytes = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);
  let before: string[] = [];
  await environment.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(`gs://${BUCKET}`);
    for (const path of paths)
      await storage
        .ref(path)
        .put(bytes, { contentType: 'image/jpeg', cacheControl: LEGACY_PHOTO_CACHE });
    await storage
      .ref(unexpected)
      .put(bytes, { contentType: 'text/plain', cacheControl: LEGACY_PHOTO_CACHE });
    before = await Promise.all(
      paths.map((path) => storage.ref(path).getDownloadURL() as Promise<string>),
    );
  });
  const transport = jsonApiTransport({
    base: 'http://127.0.0.1:19199',
    bucket: BUCKET,
    authorization: async () => 'Bearer owner',
  });
  const dry = await migratePhotoCache({ transport, inventory, apply: false });
  expect(dry).toMatchObject({ inspected: 3, pending: 2, updated: 0 });
  const applied = await migratePhotoCache({ transport, inventory, apply: true });
  expect(applied).toMatchObject({ pending: 2, updated: 2, failed: [] });
  expect(applied.skipped).toEqual([{ name: unexpected, reason: 'outside the photo namespace' }]);
  await environment.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage(`gs://${BUCKET}`);
    for (const [index, path] of paths.entries()) {
      const metadata = await storage.ref(path).getMetadata();
      expect(metadata.cacheControl).toBe(PHOTO_CACHE);
      expect(metadata.contentType).toBe('image/jpeg');
      // Existing token URLs stay valid and now carry the cacheable header.
      expect(await storage.ref(path).getDownloadURL()).toBe(before[index]);
      const response = await fetch(before[index]!);
      expect(response.headers.get('cache-control')).toBe(PHOTO_CACHE);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    }
    expect((await storage.ref(unexpected).getMetadata()).cacheControl).toBe(LEGACY_PHOTO_CACHE);
  });
  const rerun = await migratePhotoCache({ transport, inventory, apply: true });
  expect(rerun).toMatchObject({ current: 2, pending: 0, updated: 0 });
});
