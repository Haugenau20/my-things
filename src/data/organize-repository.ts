import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { idSchema, isVisible, parseItem, roomSchema } from '../domain/item';
import type { Item, Room } from '../domain/item';
import {
  applyCommand,
  boxSchema,
  commandPatch,
  commandSchema,
  isDisposed,
} from '../domain/organize';
import type { Box, ItemCommand } from '../domain/organize';
import { loadItem, loadItems } from './capture-repository';

export class RevisionConflict extends Error {
  constructor() {
    super('This record changed elsewhere. Refresh and review the latest version before retrying.');
  }
}
function reference(
  db: Firestore,
  inventory: string,
  type: 'rooms' | 'boxes' | 'items',
  id: string,
) {
  return doc(db, 'inventories', idSchema.parse(inventory), type, idSchema.parse(id));
}
export async function editItem(
  db: Firestore,
  inventory: string,
  expected: Item,
  input: ItemCommand,
  signal?: AbortSignal,
): Promise<Item> {
  const command = commandSchema.parse(input);
  const target = reference(db, inventory, 'items', expected.id);
  await runTransaction(db, async (tx) => {
    signal?.throwIfAborted();
    const snapshot = await tx.get(target);
    if (!snapshot.exists()) throw new RevisionConflict();
    const current = parseItem(snapshot.data(), inventory, expected.id);
    if (current.revision !== expected.revision) throw new RevisionConflict();
    const next = applyCommand(current, command, Timestamp.now());
    const patch = commandPatch(current, command, Timestamp.now());
    let destination: { ref: ReturnType<typeof reference>; revision: number } | undefined;
    const roomAssignment = command.kind === 'setRoom' && next.roomId !== current.roomId;
    const boxAssignment =
      (command.kind === 'pack' && next.boxId !== current.boxId) ||
      (command.kind === 'restore' && !isDisposed(next));
    const kind = roomAssignment ? 'rooms' : 'boxes';
    const id = roomAssignment ? next.roomId : boxAssignment ? next.boxId : null;
    if (id !== null) {
      const ref = reference(db, inventory, kind, id);
      const data = (await tx.get(ref)).data();
      const value = kind === 'rooms' ? roomSchema.parse(data) : boxSchema.parse(data);
      if (value.archivedAt !== null)
        throw new Error(
          command.kind === 'restore'
            ? 'Reactivate this item’s box in Manage rooms & boxes before restoring it.'
            : 'This location is archived. Choose an active location.',
        );
      destination = { ref, revision: value.revision };
    }
    signal?.throwIfAborted();
    // Resolve only changed timestamps on the server; retained history stays intact.
    tx.update(target, {
      ...patch,
      ...(patch.completedAt ? { completedAt: serverTimestamp() } : {}),
      ...(patch.deletedAt ? { deletedAt: serverTimestamp() } : {}),
      revision: next.revision,
      updatedAt: serverTimestamp(),
    });
    if (destination)
      tx.update(destination.ref, {
        revision: destination.revision + 1,
        updatedAt: serverTimestamp(),
      });
  });
  signal?.throwIfAborted();
  const saved = await loadItem(db, inventory, expected.id);
  if (!saved)
    throw new Error('Save acknowledgment could not be verified. Refresh before retrying.');
  return saved;
}
export type BulkResult = {
  id: string;
  name: string;
  status: 'saved' | 'conflict' | 'failed';
  message: string;
};
export async function bulkEdit(
  db: Firestore,
  inventory: string,
  items: Item[],
  command: ItemCommand,
  signal?: AbortSignal,
): Promise<BulkResult[]> {
  commandSchema.parse(command);
  const results: BulkResult[] = new Array(items.length);
  let cursor = 0;
  // Assignments share a destination revision; serialize this batch to avoid self-contention.
  await Promise.all(
    Array.from({ length: Math.min(1, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        const item = items[index]!;
        try {
          await editItem(db, inventory, item, command, signal);
          results[index] = { id: item.id, name: item.name, status: 'saved', message: 'Saved' };
        } catch (error) {
          results[index] = {
            id: item.id,
            name: item.name,
            status: error instanceof RevisionConflict ? 'conflict' : 'failed',
            message:
              error instanceof RevisionConflict
                ? error.message
                : signal?.aborted
                  ? 'Canceled; refresh to check any writes already submitted.'
                  : 'Could not save. Refresh and check the connection or pending photo operation.',
          };
        }
      }
    }),
  );
  return results;
}
export async function loadBoxes(db: Firestore, inventory: string): Promise<Box[]> {
  idSchema.parse(inventory);
  // Boxes are a small flat list; validate every returned record before exposing choices.
  const result = await getDocsFromServer(collection(db, 'inventories', inventory, 'boxes'));
  return result.docs
    .map((record) => ({ ...boxSchema.parse(record.data()), id: idSchema.parse(record.id) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}
export async function createBox(
  db: Firestore,
  inventory: string,
  label: string,
  sortOrder: number,
): Promise<Box> {
  const id = crypto.randomUUID();
  const target = reference(db, inventory, 'boxes', id);
  const value = boxSchema.parse({
    schemaVersion: 2,
    revision: 1,
    label: label.trim(),
    notes: '',
    sortOrder,
    archivedAt: null,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  await runTransaction(db, async (tx) => {
    if ((await tx.get(target)).exists()) throw new Error('Box identity collision');
    tx.set(target, { ...value, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
  return { ...boxSchema.parse((await getDocFromServer(target)).data()), id };
}
export async function updateLocation(
  db: Firestore,
  inventory: string,
  kind: 'room' | 'box',
  expected: Room | Box,
  patch: { label?: string; sortOrder?: number; notes?: string },
): Promise<Room | Box> {
  const target = reference(db, inventory, kind === 'room' ? 'rooms' : 'boxes', expected.id);
  await runTransaction(db, async (tx) => {
    const data = (await tx.get(target)).data();
    const current = kind === 'room' ? roomSchema.parse(data) : boxSchema.parse(data);
    if (current.revision !== expected.revision) throw new RevisionConflict();
    const changes = {
      ...(patch.label === undefined
        ? {}
        : kind === 'room'
          ? { name: patch.label.trim() }
          : { label: patch.label.trim() }),
      ...(patch.sortOrder === undefined ? {} : { sortOrder: patch.sortOrder }),
      ...(kind === 'box' && patch.notes !== undefined ? { notes: patch.notes } : {}),
    };
    if (kind === 'room') roomSchema.parse({ ...current, ...changes });
    else boxSchema.parse({ ...current, ...changes });
    tx.update(target, { ...changes, revision: current.revision + 1, updatedAt: serverTimestamp() });
  });
  const result = (await getDocFromServer(target)).data();
  return {
    ...(kind === 'room' ? roomSchema.parse(result) : boxSchema.parse(result)),
    id: expected.id,
  };
}
export async function reactivateLocation(
  db: Firestore,
  inventory: string,
  kind: 'room' | 'box',
  id: string,
): Promise<void> {
  const target = reference(db, inventory, kind === 'room' ? 'rooms' : 'boxes', id);
  await runTransaction(db, async (tx) => {
    const data = (await tx.get(target)).data();
    const current = kind === 'room' ? roomSchema.parse(data) : boxSchema.parse(data);
    if (current.archivedAt === null) return;
    tx.update(target, {
      archivedAt: null,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  await getDocFromServer(target);
}
export async function archiveLocation(
  db: Firestore,
  inventory: string,
  kind: 'room' | 'box',
  id: string,
): Promise<void> {
  const target = reference(db, inventory, kind === 'room' ? 'rooms' : 'boxes', id);
  const initial = (await getDocFromServer(target)).data();
  const before = kind === 'room' ? roomSchema.parse(initial) : boxSchema.parse(initial);
  if (before.archivedAt !== null) return;
  const items = kind === 'box' ? await loadItems(db, inventory) : [];
  // Room tags remain readable after archive. Only boxes represent physical packing.
  if (
    items.some(
      (item) =>
        item.deletedAt === null &&
        (isVisible(item) || item.recordState === 'draft') &&
        item.boxId === id,
    )
  )
    throw new Error(
      'Move all current owned items and finish pending captures before archiving this location.',
    );
  await runTransaction(db, async (tx) => {
    const currentData = (await tx.get(target)).data();
    const current = kind === 'room' ? roomSchema.parse(currentData) : boxSchema.parse(currentData);
    if (current.revision !== before.revision) throw new RevisionConflict();
    tx.update(target, {
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      revision: current.revision + 1,
    });
  });
  await getDocFromServer(target);
}
