import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore, QueryDocumentSnapshot } from 'firebase/firestore';
import type { Item, Room } from '../domain/item';
import { idSchema, parseItem, roomSchema } from '../domain/item';
import { boxSchema } from '../domain/organize';
import type { Box } from '../domain/organize';
import { parseInventory } from '../domain/inventory';
import type { Inventory } from '../domain/inventory';
import { sha256 } from '../media/processing';
import { restoreClaimSchema, restoreReportSchema, restoreKey } from './restore-state';
import type { RestoreClaim, RestoreKind, RestoreReport } from './restore-state';
import type { ValidatedArchive } from './validation';

export type RestoreRecord = Item | Room | Box;
const collectionName = (kind: RestoreKind) =>
  kind === 'item' ? 'items' : kind === 'room' ? 'rooms' : 'boxes';
const reportRef = (db: Firestore, inventory: string) =>
  doc(db, 'inventories', idSchema.parse(inventory), 'restores', 'active');
const claimRef = (db: Firestore, inventory: string, kind: RestoreKind, id: string) =>
  doc(reportRef(db, inventory), 'records', restoreKey(kind, id));
function parseRecord(
  kind: RestoreKind,
  value: unknown,
  inventory: string,
  id: string,
): RestoreRecord {
  idSchema.parse(id);
  return {
    ...(kind === 'item'
      ? parseItem(value, inventory, id)
      : kind === 'room'
        ? roomSchema.parse(value)
        : boxSchema.parse(value)),
    id,
  };
}
function canonical(value: unknown): unknown {
  if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
export async function sourceRecordHash(record: RestoreRecord): Promise<string> {
  return sha256(new TextEncoder().encode(JSON.stringify(canonical(record))));
}
export function destinationItem(source: Item, inventory: string): Item {
  idSchema.parse(inventory);
  return {
    ...source,
    photos: source.photos.map((photo) => ({
      ...photo,
      detail: {
        ...photo.detail,
        storagePath: `inventories/${inventory}/items/${source.id}/photos/${photo.id}/detail.jpg`,
      },
      thumbnail: {
        ...photo.thumbnail,
        storagePath: `inventories/${inventory}/items/${source.id}/photos/${photo.id}/thumb.jpg`,
      },
    })),
  };
}
export function assertRestoredRecord(
  kind: RestoreKind,
  actual: RestoreRecord,
  expected: RestoreRecord,
  pending = false,
): void {
  const withoutUpdates = (record: RestoreRecord) => {
    const { revision, updatedAt, ...value } = record;
    void revision;
    void updatedAt;
    return value;
  };
  let comparison = withoutUpdates(actual);
  let original = withoutUpdates(expected);
  if (kind === 'item' && pending) {
    const item = actual as Item;
    const source = expected as Item;
    const photoIdentity = (photos: Item['photos']) =>
      photos.map(({ state, ...photo }) => {
        void state;
        return photo;
      });
    if (
      item.recordState !== 'ready' ||
      item.deletedAt !== null ||
      item.photos.some((photo) => !['pending', 'ready'].includes(photo.state)) ||
      (item.photos.length &&
        JSON.stringify(canonical(photoIdentity(item.photos))) !==
          JSON.stringify(canonical(photoIdentity(source.photos)))) ||
      (item.coverPhotoId !== null &&
        ![source.photos[0]?.id, source.coverPhotoId].includes(item.coverPhotoId))
    )
      throw new Error('An imported item changed. Recovery will not overwrite it.');
    comparison = { ...comparison, photos: [], coverPhotoId: null, deletedAt: null };
    original = { ...original, photos: [], coverPhotoId: null, deletedAt: null };
  }
  if (JSON.stringify(canonical(comparison)) !== JSON.stringify(canonical(original)))
    throw new Error('An imported record changed. Recovery will not overwrite it.');
}
export async function loadRestoreReport(
  db: Firestore,
  inventory: string,
): Promise<RestoreReport | null> {
  const snapshot = await getDocFromServer(reportRef(db, inventory));
  return snapshot.exists() ? restoreReportSchema.parse(snapshot.data()) : null;
}
export async function loadRestoreClaims(
  db: Firestore,
  inventory: string,
  report: RestoreReport,
): Promise<RestoreClaim[]> {
  const claims: RestoreClaim[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await getDocsFromServer(
      query(
        collection(reportRef(db, inventory), 'records'),
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(250),
      ),
    );
    for (const snapshot of page.docs) {
      const claim = restoreClaimSchema.parse(snapshot.data());
      if (
        snapshot.id !== restoreKey(claim.kind, claim.recordId) ||
        claim.operationId !== report.operationId
      )
        throw new Error('Restore report contains unrelated claims.');
      claims.push(claim);
    }
    if (claims.length > 15000) throw new Error('Restore report exceeds its safety limit.');
    if (page.size < 250) return claims;
    cursor = page.docs.at(-1);
  }
}
export async function loadRestoreClaim(
  db: Firestore,
  inventory: string,
  kind: RestoreKind,
  id: string,
): Promise<RestoreClaim> {
  return restoreClaimSchema.parse(
    (await getDocFromServer(claimRef(db, inventory, kind, id))).data(),
  );
}
export async function beginRestore(
  db: Firestore,
  inventory: string,
  root: Inventory,
  archive: ValidatedArchive,
  signal: AbortSignal,
): Promise<RestoreReport> {
  const target = reportRef(db, inventory);
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const policy = parseInventory((await tx.get(doc(db, 'inventories', inventory))).data());
    const existing = await tx.get(target);
    if (policy.ownerUid !== root.ownerUid || !policy.updatedAt.isEqual(root.updatedAt))
      throw new Error('Destination policy changed. Refresh before restoring.');
    if (existing.exists()) {
      const report = restoreReportSchema.parse(existing.data());
      if (
        report.manifestSha256 !== archive.manifestSha256 ||
        report.exportId !== archive.manifest.exportId ||
        JSON.stringify(report.counts) !== JSON.stringify(archive.manifest.counts)
      )
        throw new Error(
          'This destination belongs to a different import. Recovery requires the same archive.',
        );
      if (report.state === 'interrupted')
        tx.update(target, {
          state: 'restoring',
          revision: report.revision + 1,
          updatedAt: serverTimestamp(),
        });
      return;
    }
    tx.set(target, {
      schemaVersion: 2,
      revision: 1,
      operationId: crypto.randomUUID(),
      exportId: archive.manifest.exportId,
      manifestSha256: archive.manifestSha256,
      state: 'restoring',
      counts: archive.manifest.counts,
      claimedRecords: 0,
      completedRecords: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  const acknowledged = await loadRestoreReport(db, inventory);
  if (!acknowledged) throw new Error('Restore marker acknowledgment is unconfirmed.');
  return acknowledged;
}
export async function claimRestoreRecord(
  db: Firestore,
  inventory: string,
  report: RestoreReport,
  kind: RestoreKind,
  source: RestoreRecord,
  sourceHash: string,
  signal: AbortSignal,
): Promise<RestoreRecord> {
  const target = doc(db, 'inventories', inventory, collectionName(kind), source.id);
  const claim = claimRef(db, inventory, kind, source.id);
  const operation = reportRef(db, inventory);
  const expected = kind === 'item' ? destinationItem(source as Item, inventory) : source;
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const marker = restoreReportSchema.parse((await tx.get(operation)).data());
    const ledger = await tx.get(claim);
    const existing = await tx.get(target);
    if (marker.state !== 'restoring' || marker.operationId !== report.operationId)
      throw new Error('Restore operation changed. Refresh before retrying.');
    if (ledger.exists()) {
      const entry = restoreClaimSchema.parse(ledger.data());
      if (
        !existing.exists() ||
        entry.operationId !== report.operationId ||
        entry.recordSha256 !== sourceHash ||
        entry.kind !== kind ||
        entry.recordId !== source.id
      )
        throw new Error('Restore claim differs from the selected archive.');
      assertRestoredRecord(
        kind,
        parseRecord(kind, existing.data(), inventory, source.id),
        expected,
        entry.state === 'pending',
      );
      return;
    }
    if (existing.exists())
      throw new Error('Destination record collision. Existing data is preserved.');
    const { id, ...value } = expected;
    void id;
    const historical =
      kind === 'item' ? { ...value, photos: [], coverPhotoId: null, deletedAt: null } : value;
    signal.throwIfAborted();
    tx.set(target, { ...historical, revision: 1, updatedAt: serverTimestamp() });
    tx.set(claim, {
      schemaVersion: 2,
      revision: 1,
      operationId: marker.operationId,
      kind,
      recordId: source.id,
      recordSha256: sourceHash,
      state: kind === 'item' ? 'pending' : 'verified',
      deletedAt: kind === 'item' ? (source as Item).deletedAt : null,
      coverPhotoId: kind === 'item' ? (source as Item).coverPhotoId : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    tx.update(operation, {
      claimedRecords: marker.claimedRecords + 1,
      completedRecords: marker.completedRecords + (kind === 'item' ? 0 : 1),
      revision: marker.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  const snapshot = await getDocFromServer(target);
  if (!snapshot.exists()) throw new Error('Restore record acknowledgment is unconfirmed.');
  return parseRecord(kind, snapshot.data(), inventory, source.id);
}
export async function finishRestoreItem(
  db: Firestore,
  inventory: string,
  report: RestoreReport,
  expected: Item,
  sourceHash: string,
  signal: AbortSignal,
): Promise<void> {
  const target = doc(db, 'inventories', inventory, 'items', expected.id);
  const claim = claimRef(db, inventory, 'item', expected.id);
  const operation = reportRef(db, inventory);
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const marker = restoreReportSchema.parse((await tx.get(operation)).data());
    const entry = restoreClaimSchema.parse((await tx.get(claim)).data());
    const current = {
      ...parseItem((await tx.get(target)).data(), inventory, expected.id),
      id: expected.id,
    };
    if (
      marker.operationId !== report.operationId ||
      entry.operationId !== marker.operationId ||
      entry.recordSha256 !== sourceHash
    )
      throw new Error('Restore claim changed. Refresh before retrying.');
    if (entry.state === 'verified') {
      assertRestoredRecord('item', current, expected);
      return;
    }
    if (
      marker.state !== 'restoring' ||
      current.photos.some((photo) => photo.state !== 'ready') ||
      current.photos.length !== expected.photos.length
    )
      throw new Error('Imported photos are unfinished.');
    assertRestoredRecord('item', current, expected, true);
    signal.throwIfAborted();
    tx.update(target, {
      deletedAt: expected.deletedAt,
      coverPhotoId: expected.coverPhotoId,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
    tx.update(claim, {
      state: 'verified',
      revision: entry.revision + 1,
      updatedAt: serverTimestamp(),
    });
    tx.update(operation, {
      completedRecords: marker.completedRecords + 1,
      revision: marker.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  const item = {
    ...parseItem((await getDocFromServer(target)).data(), inventory, expected.id),
    id: expected.id,
  };
  assertRestoredRecord('item', item, expected);
}
export async function completeRestore(
  db: Firestore,
  inventory: string,
  report: RestoreReport,
  root: Inventory,
  archive: ValidatedArchive,
  settings: boolean,
  signal: AbortSignal,
): Promise<void> {
  const target = reportRef(db, inventory);
  const policy = doc(db, 'inventories', inventory);
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const current = restoreReportSchema.parse((await tx.get(target)).data());
    const currentRoot = parseInventory((await tx.get(policy)).data());
    if (current.operationId !== report.operationId || currentRoot.ownerUid !== root.ownerUid)
      throw new Error('Destination authority changed.');
    if (current.state === 'completed') return;
    const total = current.counts.items + current.counts.rooms + current.counts.boxes;
    if (
      current.state !== 'restoring' ||
      current.claimedRecords !== total ||
      current.completedRecords !== total ||
      !currentRoot.updatedAt.isEqual(root.updatedAt)
    )
      throw new Error('Restore or settings verification is unfinished.');
    if (settings)
      tx.update(policy, {
        displayName: archive.snapshot.inventory.displayName,
        defaultCurrency: archive.snapshot.inventory.defaultCurrency,
        updatedAt: serverTimestamp(),
      });
    tx.update(target, {
      state: 'completed',
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  if ((await loadRestoreReport(db, inventory))?.state !== 'completed')
    throw new Error('Restore completion acknowledgment is unconfirmed.');
}
export async function interruptRestore(
  db: Firestore,
  inventory: string,
  operationId: string,
): Promise<boolean> {
  try {
    const target = reportRef(db, inventory);
    await runTransaction(db, async (tx) => {
      const snapshot = await tx.get(target);
      if (!snapshot.exists()) return;
      const current = restoreReportSchema.parse(snapshot.data());
      if (
        current.operationId !== operationId ||
        current.state === 'completed' ||
        current.state === 'interrupted'
      )
        return;
      tx.update(target, {
        state: 'interrupted',
        revision: current.revision + 1,
        updatedAt: serverTimestamp(),
      });
    });
    return true;
  } catch {
    return false;
  }
}
export async function abandonUnusedRestore(
  db: Firestore,
  inventory: string,
  expected: RestoreReport,
): Promise<void> {
  const target = reportRef(db, inventory);
  await runTransaction(db, async (tx) => {
    const current = restoreReportSchema.parse((await tx.get(target)).data());
    if (
      current.operationId !== expected.operationId ||
      current.state !== 'interrupted' ||
      current.claimedRecords !== 0
    )
      throw new Error(
        'An import with created records cannot be abandoned or erased automatically.',
      );
    tx.delete(target);
  });
  if ((await getDocFromServer(target)).exists())
    throw new Error('Restore unlock acknowledgment is unconfirmed.');
}
