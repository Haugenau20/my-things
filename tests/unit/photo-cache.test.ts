import { describe, expect, it } from 'vitest';
import { jsonApiTransport, migratePhotoCache } from '../../scripts/photo-cache';
import type { StorageTransport, StoredObject } from '../../scripts/photo-cache';
import { LEGACY_PHOTO_CACHE, PHOTO_CACHE } from '../../src/media/cache-policy';

const photo = (item: string, variant = 'detail') =>
  `inventories/main/items/${item}/photos/photo-${item}/${variant}.jpg`;
function fakeStorage(objects: StoredObject[], pageSize = 2) {
  const patched: string[] = [];
  const transport: StorageTransport = {
    async list(prefix, pageToken) {
      const matching = objects.filter((object) => object.name.startsWith(prefix));
      const start = pageToken ? Number(pageToken) : 0;
      const next = start + pageSize;
      return {
        items: matching.slice(start, next).map((object) => ({ ...object })),
        ...(next < matching.length ? { nextPageToken: String(next) } : {}),
      };
    },
    async patchCacheControl(name, metageneration, value) {
      const object = objects.find((entry) => entry.name === name)!;
      if (object.metageneration !== metageneration) throw new Error('precondition');
      patched.push(name);
      object.cacheControl = value;
      object.metageneration = String(Number(metageneration) + 1);
      return { ...object };
    },
  };
  return { transport, patched };
}
const legacy = (name: string): StoredObject => ({
  name,
  metageneration: '1',
  contentType: 'image/jpeg',
  cacheControl: LEGACY_PHOTO_CACHE,
});

describe('photo Cache-Control migration', () => {
  it('reports legacy photos without changing anything in a dry run', async () => {
    const objects = [legacy(photo('a')), legacy(photo('a', 'thumb')), legacy(photo('b'))];
    const { transport, patched } = fakeStorage(objects);
    const report = await migratePhotoCache({ transport, inventory: 'main', apply: false });
    expect(report).toMatchObject({ inspected: 3, current: 0, pending: 3, updated: 0 });
    expect(patched).toEqual([]);
  });

  it('updates only legacy photo objects across pages and is idempotent', async () => {
    const objects: StoredObject[] = [
      legacy(photo('a')),
      legacy(photo('a', 'thumb')),
      { ...legacy(photo('b')), cacheControl: PHOTO_CACHE },
      legacy('inventories/main/items/a/unexpected.txt'),
      { ...legacy(photo('c')), contentType: 'image/png' },
      { ...legacy(photo('d')), cacheControl: 'public, max-age=60' },
      legacy('inventories/other/items/a/photos/p/detail.jpg'),
    ];
    const { transport, patched } = fakeStorage(objects);
    const report = await migratePhotoCache({ transport, inventory: 'main', apply: true });
    expect(patched.sort()).toEqual([photo('a'), photo('a', 'thumb')]);
    expect(report.updated).toBe(2);
    expect(report.current).toBe(1);
    expect(report.failed).toEqual([]);
    expect(report.skipped.map((entry) => entry.name).sort()).toEqual(
      ['inventories/main/items/a/unexpected.txt', photo('c'), photo('d')].sort(),
    );
    // The other inventory's object is outside the listed prefix entirely.
    expect(objects.at(-1)!.cacheControl).toBe(LEGACY_PHOTO_CACHE);
    const again = await migratePhotoCache({ transport, inventory: 'main', apply: true });
    expect(again).toMatchObject({ current: 3, pending: 0, updated: 0 });
  });

  it('reports per-object failures instead of claiming success', async () => {
    const objects = [legacy(photo('a')), legacy(photo('b'))];
    const { transport } = fakeStorage(objects);
    const failing: StorageTransport = {
      ...transport,
      async patchCacheControl(name, metageneration, value) {
        if (name === photo('b')) throw new Error('Object changed during migration');
        return transport.patchCacheControl(name, metageneration, value);
      },
    };
    const report = await migratePhotoCache({ transport: failing, inventory: 'main', apply: true });
    expect(report.updated).toBe(1);
    expect(report.failed).toEqual([
      { name: photo('b'), reason: 'Object changed during migration' },
    ]);
  });

  it('rejects an invalid inventory and repeated page tokens', async () => {
    const { transport } = fakeStorage([]);
    await expect(
      migratePhotoCache({ transport, inventory: '../main', apply: false }),
    ).rejects.toThrow();
    const looping: StorageTransport = {
      ...transport,
      list: async () => ({ items: [], nextPageToken: 'same' }),
    };
    await expect(
      migratePhotoCache({ transport: looping, inventory: 'main', apply: true }),
    ).rejects.toThrow(/Repeated page token/);
  });

  it('sends conditional JSON API patches that change only Cache-Control', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const transport = jsonApiTransport({
      base: 'https://storage.example/storage/v1',
      bucket: 'synthetic.firebasestorage.app',
      authorization: async () => 'Bearer synthetic',
      fetch: async (url, init) => {
        requests.push({ url, init });
        return new Response(
          JSON.stringify({ name: photo('a'), metageneration: '2', cacheControl: PHOTO_CACHE }),
          { status: 200 },
        );
      },
    });
    await transport.patchCacheControl(photo('a'), '1', PHOTO_CACHE);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request!.url).toBe(
      `https://storage.example/storage/v1/b/synthetic.firebasestorage.app/o/${encodeURIComponent(photo('a'))}?ifMetagenerationMatch=1`,
    );
    expect(request!.init.method).toBe('PATCH');
    expect(JSON.parse(String(request!.init.body))).toEqual({ cacheControl: PHOTO_CACHE });
    expect(request!.init.headers).toMatchObject({ authorization: 'Bearer synthetic' });
  });

  it('turns a precondition failure into a retry instruction', async () => {
    const transport = jsonApiTransport({
      base: 'https://storage.example/storage/v1',
      bucket: 'synthetic.firebasestorage.app',
      authorization: async () => 'Bearer synthetic',
      fetch: async () => new Response('', { status: 412 }),
    });
    await expect(transport.patchCacheControl(photo('a'), '1', PHOTO_CACHE)).rejects.toThrow(
      /rerun/,
    );
  });
});
