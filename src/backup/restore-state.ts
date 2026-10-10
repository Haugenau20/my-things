import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';
import { idSchema } from '../domain/item';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const restoreCountsSchema = z.strictObject({
  items: integer.max(5000),
  rooms: integer.max(5000),
  boxes: integer.max(5000),
  photos: integer.max(10000),
  photoFiles: integer.max(20000),
});
export const restoreReportSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    revision: integer.min(1),
    operationId: idSchema,
    exportId: idSchema,
    manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(['restoring', 'interrupted', 'completed']),
    counts: restoreCountsSchema,
    claimedRecords: integer.max(15000),
    completedRecords: integer.max(15000),
    createdAt: z.instanceof(Timestamp),
    updatedAt: z.instanceof(Timestamp),
  })
  .superRefine((report, context) => {
    const total = report.counts.items + report.counts.rooms + report.counts.boxes;
    if (
      report.counts.photos > report.counts.items * 2 ||
      report.counts.photoFiles !== report.counts.photos * 2 ||
      report.completedRecords > report.claimedRecords ||
      report.claimedRecords > total ||
      (report.state === 'completed' &&
        (report.claimedRecords !== total || report.completedRecords !== total))
    )
      context.addIssue({ code: 'custom', message: 'Invalid restore counters' });
  });
export const restoreClaimSchema = z
  .strictObject({
    schemaVersion: z.literal(2),
    revision: integer.min(1),
    operationId: idSchema,
    kind: z.enum(['item', 'room', 'box']),
    recordId: idSchema,
    recordSha256: z.string().regex(/^[a-f0-9]{64}$/),
    state: z.enum(['pending', 'verified']),
    deletedAt: z.instanceof(Timestamp).nullable(),
    coverPhotoId: idSchema.nullable(),
    createdAt: z.instanceof(Timestamp),
    updatedAt: z.instanceof(Timestamp),
  })
  .superRefine((claim, context) => {
    if (
      claim.kind !== 'item' &&
      (claim.state !== 'verified' || claim.deletedAt !== null || claim.coverPhotoId !== null)
    )
      context.addIssue({ code: 'custom', message: 'Invalid location claim' });
  });
export type RestoreReport = z.infer<typeof restoreReportSchema>;
export type RestoreClaim = z.infer<typeof restoreClaimSchema>;
export type RestoreKind = RestoreClaim['kind'];
export function restoreKey(kind: RestoreKind, id: string): string {
  return `${kind}_${idSchema.parse(id)}`;
}
