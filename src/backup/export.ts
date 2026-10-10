import { Timestamp } from 'firebase/firestore';
import { Zip, ZipPassThrough } from 'fflate';
import type { Item, PhotoFile, Room } from '../domain/item';
import { idSchema, parseItem, roomSchema } from '../domain/item';
import type { Inventory } from '../domain/inventory';
import { parseInventory } from '../domain/inventory';
import type { Box } from '../domain/organize';
import { boxSchema, moneyInput, isDisposed } from '../domain/organize';
import { sha256 } from '../media/processing';

export const EXPORT_PART_BYTES = 100 * 1024 * 1024;
export const EXPORT_METADATA_BYTES = 64 * 1024 * 1024;
export const EXPORT_MAX_RECORDS = 5000;
const ZIP_OVERHEAD_BYTES = 16 * 1024 * 1024;
export type ExportSnapshot = {
  inventoryId: string;
  inventory: Inventory;
  items: Item[];
  rooms: Room[];
  boxes: Box[];
};
export type Payload = { path: string; bytes: Uint8Array<ArrayBuffer> };
export type ExportPart = { name: string; blob: Blob; final: boolean; payloadBytes: number };
export type ManifestFile = { archive: string; path: string; byteSize: number; sha256: string };
export type ExportManifest = {
  format: 'home-inventory-export';
  formatVersion: 2;
  dataSchemaVersion: 2;
  exportId: string;
  createdAt: string;
  complete: true;
  counts: { items: number; rooms: number; boxes: number; photos: number; photoFiles: number };
  archives: string[];
  files: ManifestFile[];
};
const encoder = new TextEncoder();
function unique<T extends { id: string }>(records: T[]): T[] {
  if (records.length > EXPORT_MAX_RECORDS)
    throw new Error('Export exceeds the tested record limit.');
  if (new Set(records.map((record) => record.id)).size !== records.length)
    throw new Error('Duplicate record IDs block export.');
  return records.sort((a, b) => a.id.localeCompare(b.id));
}
export function preflightExport(source: ExportSnapshot): ExportSnapshot {
  const inventoryId = idSchema.parse(source.inventoryId);
  const snapshot = {
    inventoryId,
    inventory: parseInventory(source.inventory),
    items: unique(
      source.items.map(({ id, ...record }) => ({ ...parseItem(record, inventoryId, id), id })),
    ),
    rooms: unique(
      source.rooms.map(({ id, ...record }) => ({
        ...roomSchema.parse(record),
        id: idSchema.parse(id),
      })),
    ),
    boxes: unique(
      source.boxes.map(({ id, ...record }) => ({
        ...boxSchema.parse(record),
        id: idSchema.parse(id),
      })),
    ),
  };
  const rooms = new Set(snapshot.rooms.map((room) => room.id));
  const boxes = new Set(snapshot.boxes.map((box) => box.id));
  for (const item of snapshot.items) {
    if (item.recordState !== 'ready' || item.photos.some((photo) => photo.state !== 'ready'))
      throw new Error(
        'Resolve unfinished captures, photo operations, and deletions before exporting.',
      );
    if (
      (item.roomId !== null && !rooms.has(item.roomId)) ||
      (item.boxId !== null && !boxes.has(item.boxId))
    )
      throw new Error('A missing room or box reference blocks a complete export.');
  }
  return snapshot;
}
export function photoExportPath(item: string, photo: string, variant: 'detail' | 'thumb'): string {
  return `photos/${idSchema.parse(item)}/${idSchema.parse(photo)}/${variant}.jpg`;
}
function times(value: unknown): unknown {
  if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(times);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, times(entry)]));
  return value;
}
function json(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(value, null, 2) + '\n');
}
export function csvCell(value: string, preserveZeroes = false): string {
  let start = 0;
  while (start < value.length && (value.charCodeAt(start) <= 32 || /\s/u.test(value[start]!)))
    ++start;
  const guarded =
    /^[=+@-]/.test(value.slice(start)) || (preserveZeroes && /^0\d/.test(value))
      ? `'${value}`
      : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
function csv(snapshot: ExportSnapshot): string {
  const rooms = new Map(snapshot.rooms.map((room) => [room.id, room.name]));
  const boxes = new Map(snapshot.boxes.map((box) => [box.id, box.label]));
  const headers = [
    'id',
    'name',
    'quantity',
    'estimatedValue',
    'currency',
    'serialNumber',
    'notes',
    'category',
    'roomId',
    'roomName',
    'boxState',
    'boxId',
    'boxLabel',
    'reviewStatus',
    'decision',
    'progress',
    'createdAt',
    'completedAt',
    'deletedAt',
    'coverPhotoPath',
    'photoCount',
  ];
  const time = (value: Timestamp | null) => value?.toDate().toISOString() ?? '';
  return (
    [
      headers.map((value) => csvCell(value)).join(','),
      ...snapshot.items.map((item) => {
        return [
          item.id,
          item.name,
          String(item.quantity),
          item.estimatedValue ? moneyInput(item.estimatedValue) : '',
          item.estimatedValue?.currency ?? '',
          item.serialNumber ?? '',
          item.notes,
          item.category ?? '',
          item.roomId ?? '',
          item.roomId ? rooms.get(item.roomId)! : '',
          isDisposed(item) ? 'gone' : item.boxId ? 'packed' : 'unpacked',
          item.boxId ?? '',
          item.boxId ? boxes.get(item.boxId)! : '',
          item.reviewStatus,
          item.decision,
          item.progress,
          time(item.createdAt),
          time(item.completedAt),
          time(item.deletedAt),
          item.coverPhotoId ? photoExportPath(item.id, item.coverPhotoId, 'detail') : '',
          String(item.photos.length),
        ]
          .map((value, index) => csvCell(value, index === 5))
          .join(',');
      }),
    ].join('\r\n') + '\r\n'
  );
}
export function serializeExport(snapshot: ExportSnapshot): Payload[] {
  const { inventory, inventoryId, items, rooms, boxes } = snapshot;
  const portable = items.map((item) => ({
    ...item,
    photos: item.photos.map((photo) => {
      const file = (source: PhotoFile, variant: 'detail' | 'thumb') => {
        const { storagePath, ...metadata } = source;
        void storagePath;
        return { ...metadata, filePath: photoExportPath(item.id, photo.id, variant) };
      };
      return {
        ...photo,
        detail: file(photo.detail, 'detail'),
        thumbnail: file(photo.thumbnail, 'thumb'),
      };
    }),
  }));
  const payload: Payload[] = [
    {
      path: 'inventory.json',
      bytes: json({
        schemaVersion: 2,
        sourceInventoryId: inventoryId,
        displayName: inventory.displayName,
        defaultCurrency: inventory.defaultCurrency,
      }),
    },
    { path: 'rooms.json', bytes: json(times(rooms)) },
    { path: 'boxes.json', bytes: json(times(boxes)) },
    { path: 'items.json', bytes: json(times(portable)) },
    { path: 'items.csv', bytes: encoder.encode(csv(snapshot)) },
    {
      path: 'EXPORT_README.txt',
      bytes: encoder.encode(
        'Home inventory export — format version 2\n\nThis is unencrypted personal data. Keep every ZIP listed in manifest.json together, outside the Firebase project and this source repository. JSON is authoritative; CSV quotes and neutralizes formula-like text and leading-zero serial numbers. Import CSV columns as text where necessary. Photo absence is valid. Timestamps in JSON preserve seconds and nanoseconds.\n\nChecksums verify copy integrity, not authenticity or encryption. This export is a validated copy made while avoiding edits, not an atomic cross-service snapshot. No account authorization, credentials, project/bucket configuration, or download tokens are included. A backup is not a verified recovery until restore has been tested.\n',
      ),
    },
  ];
  if (payload.reduce((sum, file) => sum + file.bytes.byteLength, 0) > EXPORT_METADATA_BYTES)
    throw new Error('Export metadata exceeds the tested memory limit.');
  return payload;
}
function stamp(snapshot: ExportSnapshot): string {
  const records = (values: { id: string; revision: number }[]) =>
    values.map(({ id, revision }) => [id, revision]);
  return JSON.stringify([
    snapshot.inventoryId,
    snapshot.inventory,
    records(snapshot.items),
    records(snapshot.rooms),
    records(snapshot.boxes),
  ]);
}
async function archive(entries: Payload[], createdAt: Date, signal: AbortSignal): Promise<Blob> {
  let size = 0;
  let failure: Error | null = null;
  let finished = false;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      return;
    }
    size += chunk.byteLength;
    if (size > EXPORT_PART_BYTES + ZIP_OVERHEAD_BYTES) {
      failure = new Error('ZIP exceeds its bounded output limit.');
      return;
    }
    chunks.push(chunk);
    finished ||= final;
  });
  try {
    for (const entry of entries) {
      signal.throwIfAborted();
      const file = new ZipPassThrough(entry.path);
      file.mtime = createdAt;
      zip.add(file);
      for (let offset = 0; offset < entry.bytes.length; offset += 65536) {
        signal.throwIfAborted();
        file.push(entry.bytes.subarray(offset, offset + 65536));
        if (failure) throw failure;
        if (offset % 1048576 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      file.push(new Uint8Array(0), true);
      if (failure) throw failure;
    }
    zip.end();
    if (failure) throw failure;
    if (!finished) throw new Error('ZIP finalization is unfinished.');
    signal.throwIfAborted();
    return new Blob(chunks, { type: 'application/zip' });
  } finally {
    zip.terminate();
    chunks.length = 0;
  }
}
export async function* exportParts(
  input: ExportSnapshot,
  readPhoto: (file: PhotoFile, signal: AbortSignal) => Promise<ArrayBuffer>,
  recheck: () => Promise<ExportSnapshot>,
  signal: AbortSignal,
  progress: (message: string) => void,
  options: {
    exportId?: string;
    createdAt?: Date;
    partBytes?: number;
    retained?: (bytes: number) => void;
  } = {},
): AsyncGenerator<ExportPart> {
  signal.throwIfAborted();
  const snapshot = preflightExport(input);
  const exportId = idSchema.parse(options.exportId ?? crypto.randomUUID());
  const createdAt = options.createdAt ?? new Date();
  if (
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.getUTCFullYear() < 1980 ||
    createdAt.getUTCFullYear() > 2107
  )
    throw new Error('Invalid export time.');
  const limit = options.partBytes ?? EXPORT_PART_BYTES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > EXPORT_PART_BYTES)
    throw new Error('Invalid ZIP part limit.');
  const main = `inventory-${exportId}.zip`;
  const metadata = serializeExport(snapshot);
  const planned = snapshot.items.flatMap((item) =>
    item.photos.flatMap((photo) => [
      { path: photoExportPath(item.id, photo.id, 'detail'), file: photo.detail },
      { path: photoExportPath(item.id, photo.id, 'thumb'), file: photo.thumbnail },
    ]),
  );
  const metadataBytes = metadata.reduce((sum, file) => sum + file.bytes.length, 0);
  // Reserve manifest space before choosing the single-part layout.
  const reserve = 16384 + (planned.length + metadata.length) * 1024;
  const multipart =
    metadataBytes + planned.reduce((sum, value) => sum + value.file.byteSize, 0) + reserve > limit;
  let entries: Payload[] = multipart ? [] : [...metadata];
  let payloadBytes = multipart ? 0 : metadataBytes;
  const names: string[] = [];
  const files: ManifestFile[] = [];
  let index = 1;
  const partName = () => `inventory-${exportId}-photos-${String(index).padStart(3, '0')}.zip`;
  for (const file of metadata)
    files.push({
      archive: main,
      path: file.path,
      byteSize: file.bytes.length,
      sha256: await sha256(file.bytes),
    });
  for (let cursor = 0; cursor < planned.length; cursor++) {
    signal.throwIfAborted();
    const next = planned[cursor]!;
    if (next.file.byteSize > limit) throw new Error('A photo exceeds the ZIP part limit.');
    if (multipart && entries.length && payloadBytes + next.file.byteSize > limit) {
      const name = partName();
      names.push(name);
      progress(`Preparing photo part ${index}…`);
      const blob = await archive(entries, createdAt, signal);
      entries = [];
      const completedBytes = payloadBytes;
      payloadBytes = 0;
      options.retained?.(0);
      yield { name, blob, final: false, payloadBytes: completedBytes };
      signal.throwIfAborted();
      ++index;
    }
    progress(`Verifying photo file ${cursor + 1} of ${planned.length}…`);
    const bytes = new Uint8Array(await readPhoto(next.file, signal));
    signal.throwIfAborted();
    if (bytes.byteLength !== next.file.byteSize || (await sha256(bytes)) !== next.file.sha256)
      throw new Error('Missing or changed photo bytes block a complete export.');
    entries.push({ path: next.path, bytes });
    payloadBytes += bytes.length;
    options.retained?.(payloadBytes);
    files.push({
      archive: multipart ? partName() : main,
      path: next.path,
      byteSize: bytes.length,
      sha256: next.file.sha256,
    });
  }
  if (multipart && entries.length) {
    const name = partName();
    names.push(name);
    const blob = await archive(entries, createdAt, signal);
    entries = [];
    const completedBytes = payloadBytes;
    payloadBytes = 0;
    options.retained?.(0);
    yield { name, blob, final: false, payloadBytes: completedBytes };
    signal.throwIfAborted();
  }
  progress('Rechecking inventory before finalizing the manifest…');
  const current = preflightExport(await recheck());
  signal.throwIfAborted();
  if (stamp(current) !== stamp(snapshot))
    throw new Error('Inventory changed during export. No complete backup was finalized.');
  const manifest: ExportManifest = {
    format: 'home-inventory-export',
    formatVersion: 2,
    dataSchemaVersion: 2,
    exportId,
    createdAt: createdAt.toISOString(),
    complete: true,
    counts: {
      items: snapshot.items.length,
      rooms: snapshot.rooms.length,
      boxes: snapshot.boxes.length,
      photos: planned.length / 2,
      photoFiles: planned.length,
    },
    archives: [main, ...names],
    files,
  };
  if (multipart) {
    entries = [...metadata];
    payloadBytes = metadataBytes;
  }
  const manifestBytes = json(manifest);
  entries.push({ path: 'manifest.json', bytes: manifestBytes });
  payloadBytes += manifestBytes.length;
  if (payloadBytes > EXPORT_PART_BYTES) throw new Error('Metadata ZIP exceeds its payload limit.');
  options.retained?.(payloadBytes);
  progress('Finalizing the metadata and manifest ZIP…');
  const blob = await archive(entries, createdAt, signal);
  entries.length = 0;
  options.retained?.(0);
  yield { name: main, blob, final: true, payloadBytes };
}
