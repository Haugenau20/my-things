import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';
import { CURRENCIES } from './currency';

const inventorySchema = z.strictObject({
  schemaVersion: z.literal(2),
  ownerUid: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(100),
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine((value) => CURRENCIES.includes(value))
    .nullable(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Inventory = z.infer<typeof inventorySchema>;

export function parseInventory(value: unknown): Inventory {
  if (value && typeof value === 'object' && 'schemaVersion' in value && value.schemaVersion !== 2)
    throw new Error(
      'Unsupported inventory schema. A trusted administrative v2 cutover is required.',
    );
  return inventorySchema.parse(value);
}
