import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import { ID_PATTERN } from '../data/config';

export const idSchema = z.string().regex(ID_PATTERN);
// Keep full metadata validation within the Firestore rules expression budget (D10).
export const MAX_PHOTOS = 2;
const text = (length: number) =>
  z
    .string()
    .min(1)
    .max(length)
    .refine((value) => value === value.trim());
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const time = z.instanceof(Timestamp);
export const locationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unassigned') }),
  z.strictObject({ kind: z.literal('room'), roomId: idSchema }),
  z.strictObject({ kind: z.literal('box'), boxId: idSchema }),
]);
const fileSchema = (edge: number, bytes: number) =>
  z.strictObject({
    storagePath: z
      .string()
      .regex(
        /^inventories\/[A-Za-z0-9_-]{1,128}\/items\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,128}\/(detail|thumb)\.jpg$/,
      ),
    contentType: z.literal('image/jpeg'),
    byteSize: integer.min(1).max(bytes),
    width: integer.min(1).max(edge),
    height: integer.min(1).max(edge),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  });
export const photoSchema = z.strictObject({
  id: idSchema,
  state: z.enum(['pending', 'ready', 'deleting']),
  detail: fileSchema(2000, 8388608),
  thumbnail: fileSchema(400, 524288),
});
export type Photo = z.infer<typeof photoSchema>;
export type PhotoFile = Photo['detail'];
export const itemSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    revision: integer.min(1),
    name: text(200),
    quantity: integer.min(1).max(100000),
    estimatedValue: z
      .strictObject({
        amountMinor: integer,
        currency: z.string().refine((value) => Intl.supportedValuesOf('currency').includes(value)),
      })
      .nullable(),
    serialNumber: z.string().max(200).nullable(),
    notes: z.string().max(10000),
    category: z.string().max(100).nullable(),
    originalRoomId: idSchema.nullable(),
    currentLocation: locationSchema,
    reviewStatus: z.enum(['needs_review', 'reviewed']),
    decision: z.enum(['undecided', 'store', 'take', 'sell', 'give_away']),
    progress: z.enum(['not_started', 'in_progress', 'completed']),
    completedAt: time.nullable(),
    recordState: z.enum(['draft', 'ready', 'deleting']),
    coverPhotoId: idSchema.nullable(),
    photos: z.array(photoSchema).max(MAX_PHOTOS),
    createdAt: time,
    updatedAt: time,
    deletedAt: time.nullable(),
  })
  .superRefine((item, context) => {
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (new Set(item.photos.map((photo) => photo.id)).size !== item.photos.length)
      issue('Duplicate photo IDs');
    if (item.decision === 'undecided' && item.progress !== 'not_started')
      issue('Undecided workflow cannot advance');
    if ((item.progress === 'completed') !== (item.completedAt !== null))
      issue('Completion timestamp mismatch');
    if (
      ['sell', 'give_away'].includes(item.decision) &&
      item.progress === 'completed' &&
      item.currentLocation.kind !== 'unassigned'
    )
      issue('Disposed item has a location');
    if (item.recordState === 'ready') {
      const ready = item.photos.filter((photo) => photo.state === 'ready');
      if (
        ready.length === 0
          ? item.coverPhotoId !== null
          : !ready.some((photo) => photo.id === item.coverPhotoId)
      )
        issue('Cover must refer to a ready photo, or be null when no photo is ready');
    }
    if (item.recordState === 'draft' && (item.photos.length === 0 || item.coverPhotoId !== null))
      issue('Invalid draft');
  });
export type ItemDocument = z.infer<typeof itemSchema>;
export type Item = ItemDocument & { id: string };
export const roomSchema = z.strictObject({
  schemaVersion: z.literal(1),
  name: text(100),
  sortOrder: integer.max(100000),
  revision: integer.min(1),
  createdAt: time,
  updatedAt: time,
  archivedAt: time.nullable(),
});
export type Room = z.infer<typeof roomSchema> & { id: string };
export const captureInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  roomId: idSchema.nullable(),
  reviewStatus: z.enum(['needs_review', 'reviewed']),
  photos: z.array(photoSchema).max(MAX_PHOTOS),
});
export type CaptureInput = z.infer<typeof captureInputSchema>;
export function photoPath(
  inventory: string,
  item: string,
  photo: string,
  variant: 'detail' | 'thumb',
): string {
  [inventory, item, photo].forEach((id) => idSchema.parse(id));
  return `inventories/${inventory}/items/${item}/photos/${photo}/${variant}.jpg`;
}
export function captureDraft(input: CaptureInput, timestamp: Timestamp): ItemDocument {
  const value = captureInputSchema.parse(input);
  if (value.photos.some((photo) => photo.state !== 'pending'))
    throw new Error('New capture requires pending photos');
  return itemSchema.parse({
    schemaVersion: 1,
    revision: 1,
    name: value.name,
    quantity: 1,
    estimatedValue: null,
    serialNumber: null,
    notes: '',
    category: null,
    originalRoomId: value.roomId,
    currentLocation: value.roomId ? { kind: 'room', roomId: value.roomId } : { kind: 'unassigned' },
    reviewStatus: value.reviewStatus,
    decision: 'undecided',
    progress: 'not_started',
    completedAt: null,
    recordState: value.photos.length ? 'draft' : 'ready',
    coverPhotoId: null,
    photos: value.photos,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  });
}
export function parseItem(value: unknown, inventory: string, id: string): ItemDocument {
  idSchema.parse(inventory);
  idSchema.parse(id);
  const item = itemSchema.parse(value);
  for (const photo of item.photos) {
    if (
      photo.detail.storagePath !== photoPath(inventory, id, photo.id, 'detail') ||
      photo.thumbnail.storagePath !== photoPath(inventory, id, photo.id, 'thumb')
    )
      throw new Error('Unexpected photo namespace');
  }
  return item;
}
export function isVisible(item: ItemDocument): boolean {
  return (
    item.recordState === 'ready' &&
    item.deletedAt === null &&
    !(['sell', 'give_away'].includes(item.decision) && item.progress === 'completed')
  );
}
