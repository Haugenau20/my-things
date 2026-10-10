import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { idSchema, itemSchema, photoSchema, photoPath, roomSchema } from '../domain/item';
import type { PhotoFile } from '../domain/item';
import { boxSchema } from '../domain/organize';
import { CURRENCIES } from '../domain/currency';
import { sha256, sourceDimensions } from '../media/processing';
import {
  EXPORT_MAX_RECORDS,
  EXPORT_METADATA_BYTES,
  preflightExport,
  photoExportPath,
} from './export';
import type { ExportSnapshot } from './export';
import { indexZip, readZipMember } from './zip';
import type { ZipIndex } from './zip';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = z
  .strictObject({
    seconds: z.number().int().min(-62135596800).max(253402300799),
    nanoseconds: z
      .number()
      .int()
      .min(0)
      .max(999999999)
      .refine(
        (value) => value % 1000 === 0,
        'Timestamp precision cannot be preserved by Firestore.',
      ),
  })
  .transform(({ seconds, nanoseconds }) => new Timestamp(seconds, nanoseconds));
const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  sourceInventoryId: idSchema,
  displayName: z.string().trim().min(1).max(100),
  defaultCurrency: z
    .string()
    .refine((value) => CURRENCIES.includes(value))
    .nullable(),
});
const portableFile = (source: typeof photoSchema.shape.detail) =>
  source.omit({ storagePath: true }).extend({ filePath: z.string().max(300) });
const portablePhoto = photoSchema.extend({
  detail: portableFile(photoSchema.shape.detail),
  thumbnail: portableFile(photoSchema.shape.thumbnail),
});
const portableItem = z.strictObject({
  ...itemSchema.shape,
  id: idSchema,
  photos: z.array(portablePhoto).max(2),
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.nullable(),
  deletedAt: timestamp.nullable(),
});
const portableRoom = roomSchema.extend({
  id: idSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable(),
});
const portableBox = boxSchema.extend({
  id: idSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: timestamp.nullable(),
});
const manifestSchema = z.strictObject({
  format: z.literal('home-inventory-export'),
  formatVersion: z.literal(1),
  dataSchemaVersion: z.literal(1),
  exportId: idSchema,
  createdAt: z.iso.datetime(),
  complete: z.literal(true),
  counts: z.strictObject({
    items: integer.max(5000),
    rooms: integer.max(5000),
    boxes: integer.max(5000),
    photos: integer.max(10000),
    photoFiles: integer.max(20000),
  }),
  archives: z.array(z.string().max(170)).min(1).max(1001),
  files: z
    .array(
      z.strictObject({
        archive: z.string().max(170),
        path: z.string().max(300),
        byteSize: integer.max(EXPORT_METADATA_BYTES),
        sha256: hash,
      }),
    )
    .max(20006),
});
export type ValidatedArchive = {
  manifest: z.infer<typeof manifestSchema>;
  manifestSha256: string;
  snapshot: ExportSnapshot;
  photos: Map<string, { zip: ZipIndex; file: PhotoFile }>;
};
const metadataPaths = [
  'inventory.json',
  'rooms.json',
  'boxes.json',
  'items.json',
  'items.csv',
  'EXPORT_README.txt',
];
const decoder = new TextDecoder('utf-8', { fatal: true });
function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(decoder.decode(bytes));
}
function jpeg(bytes: Uint8Array, file: PhotoFile): void {
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
    throw new Error('Archive photo is not a supported JPEG.');
  const dimensions = sourceDimensions(bytes.subarray(0, 262144));
  if (!dimensions || dimensions.width !== file.width || dimensions.height !== file.height)
    throw new Error('Archive photo dimensions differ from its metadata.');
}
export async function readArchivePhoto(
  archive: ValidatedArchive,
  path: string,
  signal: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = archive.photos.get(path);
  if (!source) throw new Error('Archive photo reference is missing.');
  const bytes = await readZipMember(source.zip, path, source.file.byteSize, signal);
  if (bytes.length !== source.file.byteSize || (await sha256(bytes)) !== source.file.sha256)
    throw new Error('Archive photo checksum mismatch.');
  jpeg(bytes, source.file);
  signal.throwIfAborted();
  return bytes;
}
export async function validateArchive(
  files: File[],
  signal: AbortSignal,
  progress: (message: string) => void = () => {},
): Promise<ValidatedArchive> {
  signal.throwIfAborted();
  if (
    !files.length ||
    files.length > 1001 ||
    new Set(files.map((file) => file.name)).size !== files.length
  )
    throw new Error('Choose unique ZIP parts within the supported limit.');
  const indexes = new Map<string, ZipIndex>();
  let main: ZipIndex | undefined;
  for (let index = 0; index < files.length; index++) {
    progress(`Checking ZIP part ${index + 1} of ${files.length}…`);
    const zip = await indexZip(files[index]!, signal);
    indexes.set(zip.file.name, zip);
    if (zip.members.has('manifest.json')) {
      if (main) throw new Error('More than one manifest ZIP was selected.');
      main = zip;
    }
  }
  if (!main) throw new Error('The final manifest ZIP is missing.');
  const manifestBytes = await readZipMember(main, 'manifest.json', 16 * 1024 * 1024, signal);
  const manifest = manifestSchema.parse(parseJson(manifestBytes));
  const mainName = `inventory-${manifest.exportId}.zip`;
  const expectedNames = [
    mainName,
    ...Array.from(
      { length: manifest.archives.length - 1 },
      (_, index) =>
        `inventory-${manifest.exportId}-photos-${String(index + 1).padStart(3, '0')}.zip`,
    ),
  ];
  if (
    main.file.name !== mainName ||
    manifest.archives.some((name, index) => name !== expectedNames[index]) ||
    indexes.size !== expectedNames.length ||
    expectedNames.some((name) => !indexes.has(name))
  )
    throw new Error('Missing, unexpected, or incorrectly named ZIP parts.');
  const members = new Map<string, { zip: ZipIndex; size: number }>();
  for (const zip of indexes.values()) {
    for (const [path, entry] of zip.members) {
      if (members.has(path)) throw new Error('Duplicate logical path across ZIP parts.');
      members.set(path, { zip, size: entry.size });
    }
  }
  if (
    manifest.files.length + 1 !== members.size ||
    new Set(manifest.files.map((file) => file.path)).size !== manifest.files.length
  )
    throw new Error('Archive payload membership or repeated paths are invalid.');
  let metadataBytes = 0;
  const verifiedMetadata = new Map<string, Uint8Array<ArrayBuffer>>();
  const manifestFiles = new Map(manifest.files.map((file) => [file.path, file]));
  for (const entry of manifest.files) {
    signal.throwIfAborted();
    const member = members.get(entry.path);
    if (
      entry.path === 'manifest.json' ||
      !member ||
      member.zip.file.name !== entry.archive ||
      member.size !== entry.byteSize
    )
      throw new Error('Manifest payload size or archive membership mismatch.');
    if (metadataPaths.includes(entry.path)) {
      if (entry.archive !== mainName) throw new Error('Metadata must be in the main ZIP.');
      metadataBytes += entry.byteSize;
      if (metadataBytes > EXPORT_METADATA_BYTES)
        throw new Error('Archive metadata exceeds its memory limit.');
      const bytes = await readZipMember(member.zip, entry.path, entry.byteSize, signal);
      if ((await sha256(bytes)) !== entry.sha256)
        throw new Error('Archive metadata checksum mismatch.');
      if (entry.path === 'items.csv' || entry.path === 'EXPORT_README.txt') decoder.decode(bytes);
      verifiedMetadata.set(entry.path, bytes);
    }
  }
  if (metadataPaths.some((path) => !verifiedMetadata.has(path)))
    throw new Error('Required metadata payload is missing.');
  const inventory = inventorySchema.parse(parseJson(verifiedMetadata.get('inventory.json')!));
  const rooms = z
    .array(portableRoom)
    .max(EXPORT_MAX_RECORDS)
    .parse(parseJson(verifiedMetadata.get('rooms.json')!));
  const boxes = z
    .array(portableBox)
    .max(EXPORT_MAX_RECORDS)
    .parse(parseJson(verifiedMetadata.get('boxes.json')!));
  const portable = z
    .array(portableItem)
    .max(EXPORT_MAX_RECORDS)
    .parse(parseJson(verifiedMetadata.get('items.json')!));
  const photos: ValidatedArchive['photos'] = new Map();
  const items = portable.map((item) => ({
    ...item,
    photos: item.photos.map((photo) => {
      const remap = (source: typeof photo.detail, variant: 'detail' | 'thumb') => {
        const { filePath, ...metadata } = source;
        const expected = photoExportPath(item.id, photo.id, variant);
        const member = members.get(filePath);
        const entry = manifestFiles.get(filePath);
        if (
          filePath !== expected ||
          !member ||
          !entry ||
          entry.byteSize !== metadata.byteSize ||
          entry.sha256 !== metadata.sha256 ||
          photos.has(filePath)
        )
          throw new Error('Archive photo path, size, or checksum reference is invalid.');
        const file = {
          ...metadata,
          storagePath: photoPath(inventory.sourceInventoryId, item.id, photo.id, variant),
        };
        photos.set(filePath, { zip: member.zip, file });
        return file;
      };
      return {
        ...photo,
        detail: remap(photo.detail, 'detail'),
        thumbnail: remap(photo.thumbnail, 'thumb'),
      };
    }),
  }));
  // This placeholder is for domain validation only. Destination authority is always read from its trusted root.
  const snapshot = preflightExport({
    inventoryId: inventory.sourceInventoryId,
    inventory: {
      schemaVersion: 1,
      ownerUid: 'archive-validation-placeholder',
      displayName: inventory.displayName,
      defaultCurrency: inventory.defaultCurrency,
      createdAt: new Timestamp(0, 0),
      updatedAt: new Timestamp(0, 0),
    },
    items,
    rooms,
    boxes,
  });
  if (
    manifest.counts.items !== items.length ||
    manifest.counts.rooms !== rooms.length ||
    manifest.counts.boxes !== boxes.length ||
    manifest.counts.photos * 2 !== photos.size ||
    manifest.counts.photoFiles !== photos.size ||
    manifest.files.length !== metadataPaths.length + photos.size
  )
    throw new Error('Archive record, photo, or payload counts mismatch.');
  const result = { manifest, manifestSha256: await sha256(manifestBytes), snapshot, photos };
  let checked = 0;
  for (const path of photos.keys()) {
    progress(`Verifying archive photo ${++checked} of ${photos.size}…`);
    await readArchivePhoto(result, path, signal);
  }
  signal.throwIfAborted();
  progress('Archive validated. No destination writes have occurred.');
  return result;
}
