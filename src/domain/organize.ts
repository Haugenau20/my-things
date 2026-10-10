import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import { idSchema, itemSchema, locationSchema } from './item';
import type { Item, ItemDocument } from './item';
import { currencyDigits } from './currency';
export { CURRENCIES, currencyDigits } from './currency';

export const DECISIONS = ['undecided', 'store', 'take', 'sell', 'give_away'] as const;
export const PROGRESS = ['not_started', 'in_progress', 'completed'] as const;
const metadataSchema = z
  .strictObject({
    name: itemSchema.shape.name,
    quantity: itemSchema.shape.quantity,
    estimatedValue: itemSchema.shape.estimatedValue,
    serialNumber: itemSchema.shape.serialNumber,
    notes: itemSchema.shape.notes,
    category: itemSchema.shape.category,
    reviewStatus: itemSchema.shape.reviewStatus,
  })
  .partial();
export const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('metadata'), patch: metadataSchema }),
  z.strictObject({ kind: z.literal('move'), location: locationSchema }),
  z.strictObject({ kind: z.literal('original'), roomId: idSchema.nullable() }),
  z.strictObject({ kind: z.literal('decision'), decision: z.enum(DECISIONS) }),
  z.strictObject({ kind: z.literal('progress'), progress: z.enum(PROGRESS) }),
  z.strictObject({ kind: z.literal('trash') }),
  z.strictObject({ kind: z.literal('restore') }),
]);
export type ItemCommand = z.infer<typeof commandSchema>;
export type MetadataPatch = z.infer<typeof metadataSchema>;
export function isDisposed(item: ItemDocument): boolean {
  return (
    (item.decision === 'sell' || item.decision === 'give_away') && item.progress === 'completed'
  );
}
export function commandPatch(
  item: ItemDocument,
  input: ItemCommand,
  time: Timestamp,
): Partial<ItemDocument> {
  const command = commandSchema.parse(input);
  if (item.recordState !== 'ready' || item.photos.some((photo) => photo.state !== 'ready'))
    throw new Error('Finish the pending photo operation before editing.');
  if (item.deletedAt !== null && command.kind !== 'restore')
    throw new Error('Restore this item before editing.');
  switch (command.kind) {
    case 'metadata':
      return Object.fromEntries(
        Object.entries(command.patch).filter(([, value]) => value !== undefined),
      );
    case 'move':
      if (isDisposed(item))
        throw new Error('Reopen the completed outcome before assigning a location.');
      return {
        currentLocation: command.location,
        ...(command.location.kind === 'room' && item.originalRoomId === null
          ? { originalRoomId: command.location.roomId }
          : {}),
      };
    case 'original':
      return { originalRoomId: command.roomId };
    case 'decision':
      return command.decision === item.decision
        ? {}
        : { decision: command.decision, progress: 'not_started', completedAt: null };
    case 'progress':
      if (command.progress === 'completed' && item.progress === 'completed') return {};
      return {
        progress: command.progress,
        completedAt: command.progress === 'completed' ? time : null,
        ...(command.progress === 'completed' && ['sell', 'give_away'].includes(item.decision)
          ? { currentLocation: { kind: 'unassigned' as const } }
          : {}),
      };
    case 'trash':
      return { deletedAt: time };
    case 'restore':
      return { deletedAt: null };
  }
}
export function applyCommand(
  item: ItemDocument,
  command: ItemCommand,
  time: Timestamp,
): ItemDocument {
  return itemSchema.parse({
    ...item,
    ...commandPatch(item, command, time),
    revision: item.revision + 1,
    updatedAt: time,
  });
}
export function parseMoney(input: string, currency: string): ItemDocument['estimatedValue'] {
  if (!input.trim()) return null;
  if (input.trim().length > 32) throw new Error('The amount is too large.');
  const digits = currencyDigits(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(input.trim());
  if (!match || (match[2]?.length ?? 0) > digits)
    throw new Error(`Enter a nonnegative amount with at most ${digits} decimal places.`);
  const value =
    BigInt(match[1]!) * 10n ** BigInt(digits) + BigInt((match[2] ?? '').padEnd(digits, '0') || '0');
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The amount is too large.');
  return { amountMinor: Number(value), currency };
}
export function moneyInput(value: NonNullable<ItemDocument['estimatedValue']>): string {
  const digits = currencyDigits(value.currency);
  const text = String(value.amountMinor).padStart(digits + 1, '0');
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
}
export function formatMoney(value: ItemDocument['estimatedValue']): string {
  return value ? `${value.currency} ${moneyInput(value)}` : 'Unknown';
}
export type Filters = {
  search: string;
  scope: 'owned' | 'review' | 'archive' | 'trash';
  currentLocation: string;
  originalRoomId: string;
  decision: string;
  progress: string;
  reviewStatus: string;
  missingPhotos: boolean;
};
export const DEFAULT_FILTERS: Filters = {
  search: '',
  scope: 'owned',
  currentLocation: '',
  originalRoomId: '',
  decision: '',
  progress: '',
  reviewStatus: '',
  missingPhotos: false,
};
export function locationKey(location: ItemDocument['currentLocation']): string {
  return location.kind === 'room'
    ? `room:${location.roomId}`
    : location.kind === 'box'
      ? `box:${location.boxId}`
      : 'unassigned';
}
export function filterItems(items: Item[], filters: Filters): Item[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.recordState === 'ready' &&
      (filters.scope === 'trash'
        ? item.deletedAt !== null
        : item.deletedAt === null &&
          (filters.scope === 'archive'
            ? isDisposed(item)
            : !isDisposed(item) &&
              (filters.scope !== 'review' || item.reviewStatus === 'needs_review'))) &&
      (!term ||
        [item.name, item.serialNumber, item.notes, item.category].some((value) =>
          value?.toLocaleLowerCase().includes(term),
        )) &&
      (!filters.currentLocation || locationKey(item.currentLocation) === filters.currentLocation) &&
      (!filters.originalRoomId || item.originalRoomId === filters.originalRoomId) &&
      (!filters.decision || item.decision === filters.decision) &&
      (!filters.progress || item.progress === filters.progress) &&
      (!filters.reviewStatus || item.reviewStatus === filters.reviewStatus) &&
      (!filters.missingPhotos || !item.photos.some((photo) => photo.state === 'ready')),
  );
}
export const boxSchema = z.strictObject({
  schemaVersion: z.literal(1),
  label: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => value === value.trim()),
  sortOrder: z.number().int().min(0).max(100000),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  notes: z.string().max(10000).default(''),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
  archivedAt: z.instanceof(Timestamp).nullable(),
});
export type Box = z.infer<typeof boxSchema> & { id: string };
