import { expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { unzipSync, zipSync } from 'fflate';
import { captureDraft, photoPath } from '../../src/domain/item';
import { sha256 } from '../../src/media/processing';
import { exportParts } from '../../src/backup/export';
import type { ExportSnapshot, ExportManifest } from '../../src/backup/export';
import { readArchivePhoto, validateArchive } from '../../src/backup/validation';

const signal = () => new AbortController().signal;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const jpeg = new Uint8Array([
  255, 216, 255, 192, 0, 17, 8, 0, 2, 0, 2, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217,
]);
async function fixture(partBytes?: number) {
  const timestamp = new Timestamp(100, 123456000);
  const hash = await sha256(jpeg);
  const file = (variant: 'detail' | 'thumb') => ({
    storagePath: photoPath('main', 'synthetic-item', 'photo-one', variant),
    contentType: 'image/jpeg' as const,
    byteSize: jpeg.length,
    width: 2,
    height: 2,
    sha256: hash,
  });
  const source: ExportSnapshot = {
    inventoryId: 'main',
    inventory: {
      schemaVersion: 1,
      ownerUid: 'synthetic-owner',
      displayName: 'Synthetic archive',
      defaultCurrency: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    rooms: [
      {
        id: 'room-one',
        schemaVersion: 1,
        name: 'Synthetic original room',
        sortOrder: 0,
        revision: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: timestamp,
      },
    ],
    boxes: [
      {
        id: 'box-one',
        schemaVersion: 1,
        label: 'Synthetic box',
        sortOrder: 0,
        revision: 2,
        notes: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      },
    ],
    items: [
      {
        ...captureDraft(
          {
            name: '<script>Synthetic literal</script>',
            roomId: null,
            photos: [],
            reviewStatus: 'reviewed',
          },
          timestamp,
        ),
        id: 'synthetic-item',
        quantity: 7,
        estimatedValue: { amountMinor: 0, currency: 'JPY' },
        serialNumber: '00042',
        notes: 'Synthetic\næ',
        originalRoomId: 'room-one',
        currentLocation: { kind: 'box', boxId: 'box-one' },
        deletedAt: timestamp,
        photos: [
          { id: 'photo-one', state: 'ready', detail: file('detail'), thumbnail: file('thumb') },
        ],
        coverPhotoId: 'photo-one',
      },
    ],
  };
  const files: File[] = [];
  for await (const part of exportParts(
    source,
    async () => jpeg.buffer,
    async () => source,
    signal(),
    () => {},
    { exportId: 'synthetic-export', ...(partBytes ? { partBytes } : {}) },
  ))
    files.push(new File([part.blob], part.name));
  return files;
}
async function rewrite(
  input: File,
  change: (payload: Record<string, Uint8Array<ArrayBuffer>>, manifest: ExportManifest) => void,
) {
  const payload = unzipSync(new Uint8Array(await input.arrayBuffer()));
  const manifest = JSON.parse(decoder.decode(payload['manifest.json'])) as ExportManifest;
  change(payload, manifest);
  for (const entry of manifest.files) {
    entry.byteSize = payload[entry.path]!.length;
    entry.sha256 = await sha256(payload[entry.path]!);
  }
  payload['manifest.json'] = encoder.encode(JSON.stringify(manifest));
  return new File([zipSync(payload, { level: 0 })], input.name);
}
function editJson(
  payload: Record<string, Uint8Array<ArrayBuffer>>,
  path: string,
  change: (value: Record<string, unknown>[]) => void,
) {
  const value = JSON.parse(decoder.decode(payload[path])) as Record<string, unknown>[];
  change(value);
  payload[path] = encoder.encode(JSON.stringify(value));
}
it('validates a full archive without importing authority and preserves exact history/relationships', async () => {
  const archive = await validateArchive(await fixture(), signal());
  expect(archive.snapshot.items[0]).toMatchObject({
    quantity: 7,
    serialNumber: '00042',
    estimatedValue: { amountMinor: 0, currency: 'JPY' },
    originalRoomId: 'room-one',
    currentLocation: { kind: 'box', boxId: 'box-one' },
  });
  expect(archive.snapshot.items[0]!.deletedAt?.nanoseconds).toBe(123456000);
  expect(archive.snapshot.inventory.ownerUid).not.toBe('synthetic-owner');
  expect(
    await readArchivePhoto(archive, 'photos/synthetic-item/photo-one/detail.jpg', signal()),
  ).toEqual(jpeg);
});
it('requires every named part and rejects extra parts or duplicate selections', async () => {
  const parts = await fixture(jpeg.length);
  expect(parts).toHaveLength(3);
  expect((await validateArchive(parts, signal())).photos.size).toBe(2);
  await expect(validateArchive(parts.slice(1), signal())).rejects.toThrow(/Missing/);
  await expect(validateArchive([...parts, parts[0]!], signal())).rejects.toThrow(/unique/);
  await expect(
    validateArchive(
      [...parts, new File([await parts[0]!.arrayBuffer()], 'unexpected.zip')],
      signal(),
    ),
  ).rejects.toThrow();
});
it('rejects future versions, injected authorization fields, duplicate IDs and dangling references', async () => {
  const source = (await fixture())[0]!;
  const future = await rewrite(source, (_payload, manifest) => {
    Object.assign(manifest, { formatVersion: 2 });
  });
  await expect(validateArchive([future], signal())).rejects.toThrow();
  const authority = await rewrite(source, (payload) => {
    const inventory = JSON.parse(decoder.decode(payload['inventory.json']));
    inventory.ownerUid = 'untrusted-owner';
    payload['inventory.json'] = encoder.encode(JSON.stringify(inventory));
  });
  await expect(validateArchive([authority], signal())).rejects.toThrow();
  const duplicate = await rewrite(source, (payload, manifest) => {
    editJson(payload, 'items.json', (items) => items.push(items[0]!));
    manifest.counts.items = 2;
  });
  await expect(validateArchive([duplicate], signal())).rejects.toThrow(/Duplicate|reference/);
  const missing = await rewrite(source, (payload) =>
    editJson(payload, 'items.json', (items) => {
      items[0]!.originalRoomId = 'missing-room';
    }),
  );
  await expect(validateArchive([missing], signal())).rejects.toThrow(/reference/);
});
it('rejects corrupted payload hashes, count mismatches, wrong dimensions and pending operations', async () => {
  const source = (await fixture())[0]!;
  const corrupt = unzipSync(new Uint8Array(await source.arrayBuffer()));
  corrupt['items.csv']![0] = 0;
  await expect(
    validateArchive([new File([zipSync(corrupt)], source.name)], signal()),
  ).rejects.toThrow(/checksum/);
  const count = await rewrite(source, (_payload, manifest) => {
    manifest.counts.photos = 0;
  });
  await expect(validateArchive([count], signal())).rejects.toThrow(/counts/);
  const dimensions = await rewrite(source, (payload) =>
    editJson(payload, 'items.json', (items) => {
      const photos = items[0]!.photos as { detail: { width: number } }[];
      photos[0]!.detail.width = 3;
    }),
  );
  await expect(validateArchive([dimensions], signal())).rejects.toThrow(/dimensions/);
  const pending = await rewrite(source, (payload) =>
    editJson(payload, 'items.json', (items) => {
      const photos = items[0]!.photos as { state: string }[];
      photos[0]!.state = 'pending';
      items[0]!.coverPhotoId = null;
    }),
  );
  await expect(validateArchive([pending], signal())).rejects.toThrow(/unfinished/);
});
it('rejects timestamp precision that Firestore would truncate instead of silently changing history', async () => {
  const source = (await fixture())[0]!;
  const invalid = await rewrite(source, (payload) =>
    editJson(payload, 'items.json', (items) => {
      (items[0]!.createdAt as { nanoseconds: number }).nanoseconds = 123456789;
    }),
  );
  await expect(validateArchive([invalid], signal())).rejects.toThrow(/precision/);
});
