import { expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { unzipSync } from 'fflate';
import { captureDraft, photoPath } from '../../src/domain/item';
import { sha256 } from '../../src/media/processing';
import { EXPORT_PART_BYTES, exportParts } from '../../src/backup/export';
import type { ExportSnapshot } from '../../src/backup/export';

it('packages a synthetic 2 GiB photo payload into bounded independently named parts and a final manifest', async () => {
  const detail = new Uint8Array(8 * 1024 * 1024);
  detail.set([255, 216, 255, 217]);
  const thumb = new Uint8Array([255, 216, 255, 217]);
  const detailHash = await sha256(detail);
  const thumbHash = await sha256(thumb);
  const timestamp = Timestamp.fromMillis(1000);
  const source: ExportSnapshot = {
    inventoryId: 'main',
    inventory: {
      schemaVersion: 2,
      ownerUid: 'synthetic-owner',
      displayName: 'Synthetic scale',
      defaultCurrency: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    rooms: [],
    boxes: [],
    items: Array.from({ length: 256 }, (_, index) => {
      const id = `synthetic-scale-${index}`;
      const file = (variant: 'detail' | 'thumb') => ({
        storagePath: photoPath('main', id, 'photo-one', variant),
        contentType: 'image/jpeg' as const,
        byteSize: variant === 'detail' ? detail.length : thumb.length,
        width: 2,
        height: 2,
        sha256: variant === 'detail' ? detailHash : thumbHash,
      });
      return {
        ...captureDraft(
          {
            name: 'Synthetic packaging payload',
            roomId: null,
            photos: [],
            reviewStatus: 'needs_review',
          },
          timestamp,
        ),
        id,
        coverPhotoId: 'photo-one',
        photos: [
          {
            id: 'photo-one',
            state: 'ready' as const,
            detail: file('detail'),
            thumbnail: file('thumb'),
          },
        ],
      };
    }),
  };
  let peak = 0;
  let payload = 0;
  let parts = 0;
  const names: string[] = [];
  for await (const part of exportParts(
    source,
    async (file) => (file.storagePath.endsWith('/detail.jpg') ? detail.buffer : thumb.buffer),
    async () => source,
    new AbortController().signal,
    () => {},
    {
      retained: (bytes) => {
        peak = Math.max(peak, bytes);
      },
    },
  )) {
    names.push(part.name);
    expect(part.payloadBytes).toBeLessThanOrEqual(EXPORT_PART_BYTES);
    expect(part.blob.size).toBeGreaterThan(part.payloadBytes);
    if (!part.final) {
      payload += part.payloadBytes;
      ++parts;
    } else {
      const files = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
      const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as {
        archives: string[];
        files: { path: string }[];
        counts: { photoFiles: number };
      };
      expect(new Set(manifest.archives)).toEqual(new Set(names));
      expect(manifest.files).toHaveLength(518);
      expect(manifest.counts.photoFiles).toBe(512);
    }
  }
  expect(parts).toBe(22);
  expect(payload).toBe(2 * 1024 ** 3 + 256 * thumb.length);
  expect(peak).toBeLessThanOrEqual(EXPORT_PART_BYTES);
}, 120000);
