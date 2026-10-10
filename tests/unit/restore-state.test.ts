import { expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { captureDraft } from '../../src/domain/item';
import { assertRestoredRecord, sourceRecordHash } from '../../src/backup/restore-repository';
import { restoreReportSchema } from '../../src/backup/restore-state';

const timestamp = new Timestamp(10, 1000);
const original = {
  ...captureDraft(
    { name: 'Synthetic historical item', roomId: null, photos: [], reviewStatus: 'reviewed' },
    timestamp,
  ),
  id: 'synthetic-item',
  deletedAt: timestamp,
};
it('compares exact historical fields while permitting destination revisions and update times', async () => {
  const actual = { ...original, revision: 4, updatedAt: Timestamp.now() };
  expect(() => assertRestoredRecord('item', actual, original)).not.toThrow();
  expect(() => assertRestoredRecord('item', { ...actual, deletedAt: null }, original)).toThrow(
    /changed/,
  );
  expect(() => assertRestoredRecord('item', { ...actual, notes: 'different' }, original)).toThrow(
    /changed/,
  );
  expect(await sourceRecordHash(original)).not.toBe(
    await sourceRecordHash({ ...original, quantity: 7 }),
  );
});
it('allows only the narrow pending staging differences and rejects changed scalar history', () => {
  const pending = { ...original, deletedAt: null, revision: 1, updatedAt: Timestamp.now() };
  expect(() => assertRestoredRecord('item', pending, original, true)).not.toThrow();
  expect(() =>
    assertRestoredRecord('item', { ...pending, createdAt: Timestamp.now() }, original, true),
  ).toThrow(/changed/);
  expect(() =>
    assertRestoredRecord('item', { ...pending, recordState: 'deleting' }, original, true),
  ).toThrow();
});
it('rejects inconsistent recovery counters and premature completion', () => {
  const report = {
    schemaVersion: 1,
    revision: 1,
    operationId: 'operation',
    exportId: 'export',
    manifestSha256: 'a'.repeat(64),
    state: 'restoring',
    counts: { items: 1, rooms: 0, boxes: 0, photos: 0, photoFiles: 0 },
    claimedRecords: 0,
    completedRecords: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  expect(restoreReportSchema.safeParse(report).success).toBe(true);
  for (const invalid of [
    { ...report, completedRecords: 1 },
    { ...report, claimedRecords: 2 },
    { ...report, state: 'completed' },
    { ...report, counts: { ...report.counts, photos: 1 } },
  ])
    expect(restoreReportSchema.safeParse(invalid).success).toBe(false);
});
