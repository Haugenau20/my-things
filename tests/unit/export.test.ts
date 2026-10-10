import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { unzipSync } from 'fflate';
import { captureDraft } from '../../src/domain/item';
import { exportParts, preflightExport, serializeExport } from '../../src/backup/export';
import { csvCell } from '../../src/backup/export';
import { sha256 } from '../../src/media/processing';
import { photoPath } from '../../src/domain/item';
import type { ExportSnapshot } from '../../src/backup/export';

const snapshot = (): ExportSnapshot => ({
  inventoryId: 'main',
  inventory: {
    schemaVersion: 2,
    ownerUid: 'synthetic-owner',
    displayName: 'Synthetic inventory',
    defaultCurrency: null,
    createdAt: Timestamp.fromMillis(1000),
    updatedAt: Timestamp.fromMillis(1000),
  },
  rooms: [],
  boxes: [],
  items: [
    {
      ...captureDraft(
        { name: '=Synthetic formula', roomId: null, photos: [], reviewStatus: 'needs_review' },
        new Timestamp(100, 123456789),
      ),
      id: 'synthetic-item',
      quantity: 3,
      serialNumber: '00042',
      notes: 'Synthetic Unicode æ\n"quoted"',
      estimatedValue: { amountMinor: 0, currency: 'JPY' },
    },
  ],
});
describe('portable full export', () => {
  it('neutralizes leading whitespace/control formula cells and preserves literal CSV quotes', () => {
    for (const prefix of ['', ' ', '\t', '\u0000'])
      expect(csvCell(prefix + '=1+1')).toBe(`"'${prefix}=1+1"`);
    expect(csvCell('Synthetic "quote"\nline')).toBe('"Synthetic ""quote""\nline"');
    expect(csvCell('')).toBe('""');
  });
  it('preserves precise timestamps/nulls/zero and strips account and cloud authority', () => {
    const payload = serializeExport(preflightExport(snapshot()));
    const json = new TextDecoder().decode(
      payload.find((value) => value.path === 'items.json')!.bytes,
    );
    expect(JSON.parse(json)[0]).toMatchObject({
      id: 'synthetic-item',
      quantity: 3,
      createdAt: { seconds: 100, nanoseconds: 123456789 },
      coverPhotoId: null,
      photos: [],
      estimatedValue: { amountMinor: 0, currency: 'JPY' },
    });
    const all = payload.map((value) => new TextDecoder().decode(value.bytes)).join('\n');
    expect(all).not.toContain('synthetic-owner');
    expect(all).not.toContain('storagePath');
    const csv = new TextDecoder().decode(
      payload.find((value) => value.path === 'items.csv')!.bytes,
    );
    expect(csv).toContain("'=Synthetic formula");
    expect(csv).toContain("'00042");
  });
  it('blocks unresolved operations and dangling relationships instead of silently excluding records', () => {
    const input = snapshot();
    input.items[0]!.recordState = 'deleting';
    expect(() => preflightExport(input)).toThrow(/unfinished/i);
    input.items[0]!.recordState = 'ready';
    input.items[0]!.roomId = 'missing-room';
    expect(() => preflightExport(input)).toThrow(/reference/i);
  });
  it('validates and serializes 5,000 synthetic metadata records and rejects duplicates or overflow', () => {
    const input = snapshot();
    const template = input.items[0]!;
    input.items = Array.from({ length: 5000 }, (_, index) => ({
      ...template,
      id: `synthetic-metadata-${index}`,
    }));
    const records = preflightExport(input);
    const payload = serializeExport(records);
    expect(
      JSON.parse(
        new TextDecoder().decode(payload.find((file) => file.path === 'items.json')!.bytes),
      ),
    ).toHaveLength(5000);
    input.items.push({ ...template, id: 'synthetic-overflow' });
    expect(() => preflightExport(input)).toThrow(/limit/);
    input.items = [template, template];
    expect(() => preflightExport(input)).toThrow(/Duplicate/);
  });
  it('creates an independently readable ZIP and final manifest only after metadata recheck', async () => {
    const input = snapshot();
    const parts = [];
    for await (const part of exportParts(
      input,
      async () => {
        throw new Error('No photo bytes expected');
      },
      async () => input,
      new AbortController().signal,
      () => {},
      { exportId: 'synthetic-export', createdAt: new Date('2026-10-10T12:00:00Z') },
    ))
      parts.push(part);
    expect(parts).toHaveLength(1);
    const files = unzipSync(new Uint8Array(await parts[0]!.blob.arrayBuffer()));
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    expect(manifest).toMatchObject({
      format: 'home-inventory-export',
      formatVersion: 2,
      complete: true,
      counts: { items: 1, rooms: 0, boxes: 0, photos: 0, photoFiles: 0 },
    });
    expect(manifest.files).toHaveLength(6);
    const changed = snapshot();
    changed.items[0]!.revision++;
    const generator = exportParts(
      input,
      async () => new ArrayBuffer(0),
      async () => changed,
      new AbortController().signal,
      () => {},
    );
    await expect(generator.next()).rejects.toThrow(/changed/i);
  });
  async function withPhoto() {
    const source = snapshot();
    const bytes = new Uint8Array([255, 216, 255, 217]);
    const metadata = {
      contentType: 'image/jpeg' as const,
      byteSize: bytes.length,
      width: 2,
      height: 2,
      sha256: await sha256(bytes),
    };
    source.items[0]!.photos = [
      {
        id: 'photo-one',
        state: 'ready',
        detail: {
          ...metadata,
          storagePath: photoPath('main', source.items[0]!.id, 'photo-one', 'detail'),
        },
        thumbnail: {
          ...metadata,
          storagePath: photoPath('main', source.items[0]!.id, 'photo-one', 'thumb'),
        },
      },
    ];
    source.items[0]!.coverPhotoId = 'photo-one';
    return { source, bytes };
  }
  it('splits standard ZIPs, maps every payload to exactly one part, and verifies every manifest checksum', async () => {
    const { source, bytes } = await withPhoto();
    const archives = new Map<string, Record<string, Uint8Array<ArrayBuffer>>>();
    for await (const part of exportParts(
      source,
      async () => bytes.buffer,
      async () => source,
      new AbortController().signal,
      () => {},
      { partBytes: 4 },
    )) {
      archives.set(part.name, unzipSync(new Uint8Array(await part.blob.arrayBuffer())));
      if (!part.final) expect(part.payloadBytes).toBeLessThanOrEqual(4);
    }
    expect(archives.size).toBe(3);
    const main = [...archives.values()].find((entries) => entries['manifest.json'])!;
    const manifest = JSON.parse(new TextDecoder().decode(main['manifest.json'])) as {
      files: { archive: string; path: string; byteSize: number; sha256: string }[];
      archives: string[];
      counts: { photos: number; photoFiles: number };
    };
    expect(new Set(manifest.archives)).toEqual(new Set(archives.keys()));
    expect(manifest.counts).toMatchObject({ photos: 1, photoFiles: 2 });
    expect(new Set(manifest.files.map((entry) => entry.path)).size).toBe(manifest.files.length);
    for (const entry of manifest.files) {
      const payload = archives.get(entry.archive)![entry.path]!;
      expect(payload.length).toBe(entry.byteSize);
      expect(await sha256(payload)).toBe(entry.sha256);
    }
    expect(new TextDecoder().decode(main['items.json'])).toContain('"filePath": "photos/');
    expect(new TextDecoder().decode(main['items.json'])).not.toContain('storagePath');
  });
  it('never finalizes a manifest after bad bytes, a failed download, cancellation, or a changed setting', async () => {
    const { source, bytes } = await withPhoto();
    const signal = new AbortController().signal;
    const wrong = exportParts(
      source,
      async () => new Uint8Array(4).buffer,
      async () => source,
      signal,
      () => {},
    );
    await expect(wrong.next()).rejects.toThrow(/photo bytes/);
    const missing = exportParts(
      source,
      async () => {
        throw new Error('Synthetic missing object');
      },
      async () => source,
      signal,
      () => {},
    );
    await expect(missing.next()).rejects.toThrow(/missing object/);
    const controller = new AbortController();
    const canceled = exportParts(
      source,
      async () => bytes.buffer,
      async () => source,
      controller.signal,
      () => {},
      { partBytes: 4 },
    );
    expect((await canceled.next()).value?.final).toBe(false);
    controller.abort();
    await expect(canceled.next()).rejects.toThrow();
    const changed = { ...source, inventory: { ...source.inventory, defaultCurrency: 'USD' } };
    const contested = exportParts(
      source,
      async () => bytes.buffer,
      async () => changed,
      signal,
      () => {},
      { partBytes: 4 },
    );
    const results: boolean[] = [];
    await expect(
      (async () => {
        for await (const part of contested) results.push(part.final);
      })(),
    ).rejects.toThrow(/changed/);
    expect(results).toEqual([false, false]);
  });
});
