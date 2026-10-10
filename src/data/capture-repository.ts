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
import type { Firestore, QueryDocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { captureDraft, idSchema, parseItem, roomSchema } from '../domain/item';
import type { CaptureInput, Item, Room, PhotoFile } from '../domain/item';

function itemRef(db: Firestore, inventory: string, id: string) {
  idSchema.parse(inventory);
  idSchema.parse(id);
  return doc(db, 'inventories', inventory, 'items', id);
}
export async function loadItem(db: Firestore, inventory: string, id: string): Promise<Item | null> {
  const snapshot = await getDocFromServer(itemRef(db, inventory, id));
  return snapshot.exists() ? { ...parseItem(snapshot.data(), inventory, id), id } : null;
}
async function pages(
  db: Firestore,
  inventory: string,
  name: 'items' | 'rooms',
): Promise<QueryDocumentSnapshot[]> {
  idSchema.parse(inventory);
  const records: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const constraints: QueryConstraint[] = [orderBy(documentId()), limit(250)];
    if (cursor) constraints.push(startAfter(cursor));
    const page = await getDocsFromServer(
      query(collection(db, 'inventories', inventory, name), ...constraints),
    );
    records.push(...page.docs);
    if (page.size < 250) return records;
    cursor = page.docs.at(-1);
  }
}
export async function loadItems(db: Firestore, inventory: string): Promise<Item[]> {
  return (await pages(db, inventory, 'items')).map((record) => ({
    ...parseItem(record.data(), inventory, record.id),
    id: record.id,
  }));
}
export async function loadRooms(db: Firestore, inventory: string): Promise<Room[]> {
  return (await pages(db, inventory, 'rooms'))
    .map((record) => ({ ...roomSchema.parse(record.data()), id: idSchema.parse(record.id) }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
export async function createRoom(
  db: Firestore,
  inventory: string,
  name: string,
  sort: number,
): Promise<Room> {
  idSchema.parse(inventory);
  const id = crypto.randomUUID();
  const value = roomSchema.parse({
    schemaVersion: 1,
    name: name.trim(),
    sortOrder: sort,
    revision: 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    archivedAt: null,
  });
  const reference = doc(db, 'inventories', inventory, 'rooms', id);
  await runTransaction(db, async (transaction) => {
    if ((await transaction.get(reference)).exists()) throw new Error('Room identity collision');
    transaction.set(reference, {
      ...value,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return { ...roomSchema.parse((await getDocFromServer(reference)).data()), id };
}
function identity(item: ReturnType<typeof captureDraft>) {
  const file = (value: PhotoFile) => [
    value.storagePath,
    value.contentType,
    value.byteSize,
    value.width,
    value.height,
    value.sha256,
  ];
  return JSON.stringify({
    name: item.name,
    location:
      item.currentLocation.kind === 'room'
        ? ['room', item.currentLocation.roomId]
        : item.currentLocation.kind === 'box'
          ? ['box', item.currentLocation.boxId]
          : ['unassigned'],
    originalRoomId: item.originalRoomId,
    reviewStatus: item.reviewStatus,
    photos: item.photos.map(({ id, detail, thumbnail }) => ({
      id,
      detail: file(detail),
      thumbnail: file(thumbnail),
    })),
  });
}
export async function ensureDraft(
  db: Firestore,
  inventory: string,
  id: string,
  input: CaptureInput,
  signal?: AbortSignal,
): Promise<Item> {
  const expected = captureDraft(input, Timestamp.now());
  parseItem(expected, inventory, id);
  const reference = itemRef(db, inventory, id);
  await runTransaction(db, async (transaction) => {
    signal?.throwIfAborted();
    const snapshot = await transaction.get(reference);
    if (snapshot.exists()) {
      const existing = parseItem(snapshot.data(), inventory, id);
      if (existing.recordState === 'deleting' || identity(existing) !== identity(expected))
        throw new Error('Capture identity conflict. Reload unfinished captures.');
      return;
    }
    let destination: { reference: ReturnType<typeof doc>; revision: number } | undefined;
    if (input.roomId) {
      const reference = doc(db, 'inventories', inventory, 'rooms', input.roomId);
      const room = await transaction.get(reference);
      if (!room.exists() || roomSchema.parse(room.data()).archivedAt !== null)
        throw new Error('Capture room is no longer available.');
      destination = { reference, revision: roomSchema.parse(room.data()).revision };
    }
    signal?.throwIfAborted();
    transaction.set(reference, {
      ...expected,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (destination)
      transaction.update(destination.reference, {
        revision: destination.revision + 1,
        updatedAt: serverTimestamp(),
      });
  });
  signal?.throwIfAborted();
  const result = await loadItem(db, inventory, id);
  if (!result) throw new Error('Capture acknowledgment could not be verified.');
  return result;
}
export async function finishDraft(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<Item> {
  const reference = itemRef(db, inventory, item.id);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(reference);
    const current = parseItem(snapshot.data(), inventory, item.id);
    if (identity(current) !== identity(item))
      throw new Error('Capture changed. Reload before retrying.');
    if (current.recordState === 'ready') return;
    if (current.recordState !== 'draft' || current.revision !== item.revision)
      throw new Error('Capture revision conflict. Reload before retrying.');
    signal.throwIfAborted();
    transaction.update(reference, {
      photos: current.photos.map((photo) => ({ ...photo, state: 'ready' })),
      coverPhotoId: current.photos[0]!.id,
      recordState: 'ready',
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  const result = await loadItem(db, inventory, item.id);
  if (!result || result.recordState !== 'ready')
    throw new Error('Final save acknowledgment could not be verified.');
  return result;
}
export async function markDiscard(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<Item | null> {
  const reference = itemRef(db, inventory, item.id);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const current = parseItem(snapshot.data(), inventory, item.id);
    if (current.recordState === 'deleting' && current.coverPhotoId === null) return;
    if (current.recordState !== 'draft' || current.revision !== item.revision)
      throw new Error('Only an unchanged unfinished capture can be discarded.');
    signal.throwIfAborted();
    transaction.update(reference, {
      recordState: 'deleting',
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  signal.throwIfAborted();
  return loadItem(db, inventory, item.id);
}
export async function deleteDiscardedDraft(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<void> {
  const reference = itemRef(db, inventory, item.id);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) return;
    const current = parseItem(snapshot.data(), inventory, item.id);
    if (
      current.recordState !== 'deleting' ||
      current.coverPhotoId !== null ||
      current.deletedAt !== null ||
      current.revision !== item.revision
    )
      throw new Error('Discard marker changed. Reload before retrying.');
    signal.throwIfAborted();
    transaction.delete(reference);
  });
}
