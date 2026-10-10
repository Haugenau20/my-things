import { Timestamp } from 'firebase/firestore';
import { z } from 'zod';

const inventorySchema = z.strictObject({
  schemaVersion: z.literal(1),
  ownerUid: z.string().min(1).max(128),
  displayName: z.string().trim().min(1).max(100),
  defaultCurrency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});

export type Inventory = z.infer<typeof inventorySchema>;

export function parseInventory(value: unknown): Inventory {
  return inventorySchema.parse(value);
}
