import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { idSchema, parseItem } from '../domain/item';
import type { Item } from '../domain/item';
import { assertPermanentDelete } from '../media/cleanup';
import { RevisionConflict } from './organize-repository';
import { loadItem } from './capture-repository';

export async function markPermanentDelete(
  db: Firestore,
  inventory: string,
  expected: Item,
  signal: AbortSignal,
): Promise<Item | null> {
  const target = doc(
    db,
    'inventories',
    idSchema.parse(inventory),
    'items',
    idSchema.parse(expected.id),
  );
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const snapshot = await tx.get(target);
    if (!snapshot.exists()) return;
    const current = parseItem(snapshot.data(), inventory, expected.id);
    if (current.recordState === 'deleting' && current.deletedAt !== null) {
      assertPermanentDelete(current);
      return;
    }
    if (current.revision !== expected.revision) throw new RevisionConflict();
    assertPermanentDelete(current);
    signal.throwIfAborted();
    tx.update(target, {
      recordState: 'deleting',
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  return loadItem(db, inventory, expected.id);
}
export async function finishPermanentDelete(
  db: Firestore,
  inventory: string,
  expected: Item,
  signal: AbortSignal,
): Promise<void> {
  const target = doc(
    db,
    'inventories',
    idSchema.parse(inventory),
    'items',
    idSchema.parse(expected.id),
  );
  await runTransaction(db, async (tx) => {
    signal.throwIfAborted();
    const snapshot = await tx.get(target);
    if (!snapshot.exists()) return;
    const current = parseItem(snapshot.data(), inventory, expected.id);
    assertPermanentDelete(current);
    if (current.recordState !== 'deleting' || current.revision !== expected.revision)
      throw new RevisionConflict();
    signal.throwIfAborted();
    tx.delete(target);
  });
  signal.throwIfAborted();
  if ((await getDocFromServer(target)).exists())
    throw new Error('Deletion acknowledgment could not be verified.');
}
