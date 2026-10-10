import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import { idSchema, itemSchema } from './item.ts';
import type { Item, ItemDocument } from './item.ts';
import { currencyDigits } from './currency.ts';
export { CURRENCIES, currencyDigits } from './currency.ts';

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
  z.strictObject({ kind: z.literal('setRoom'), roomId: idSchema.nullable() }),
  z.strictObject({ kind: z.literal('pack'), boxId: idSchema.nullable() }),
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
    case 'setRoom':
      return { roomId: command.roomId };
    case 'pack':
      if (isDisposed(item)) throw new Error('Reopen first before packing this gone item.');
      return { boxId: command.boxId };
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
          ? { boxId: null }
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
  room: string;
  box: string;
  trash: boolean;
  decision: string;
  progress: string;
  reviewStatus: string;
  missingPhotos: boolean;
};
export const DEFAULT_FILTERS: Filters = {
  search: '',
  room: '',
  box: '',
  trash: false,
  decision: '',
  progress: '',
  reviewStatus: '',
  missingPhotos: false,
};
export function boxState(item: ItemDocument): 'unpacked' | 'gone' | { boxId: string } {
  return isDisposed(item) ? 'gone' : item.boxId === null ? 'unpacked' : { boxId: item.boxId };
}
export function filterItems(items: Item[], filters: Filters): Item[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.recordState === 'ready' &&
      (filters.trash ? item.deletedAt !== null : item.deletedAt === null) &&
      (filters.trash && !filters.box
        ? true
        : filters.box === 'gone'
          ? isDisposed(item)
          : !isDisposed(item) &&
            (!filters.box ||
              (filters.box === 'unpacked' ? item.boxId === null : item.boxId === filters.box))) &&
      (!term ||
        [item.name, item.serialNumber, item.notes, item.category].some((value) =>
          value?.toLocaleLowerCase().includes(term),
        )) &&
      (!filters.room ||
        (filters.room === 'none' ? item.roomId === null : item.roomId === filters.room)) &&
      (!filters.decision || item.decision === filters.decision) &&
      (!filters.progress || item.progress === filters.progress) &&
      (!filters.reviewStatus || item.reviewStatus === filters.reviewStatus) &&
      (!filters.missingPhotos || !item.photos.some((photo) => photo.state === 'ready')),
  );
}
export const boxSchema = z.strictObject({
  schemaVersion: z.literal(2),
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
