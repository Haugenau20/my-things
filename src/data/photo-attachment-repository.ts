import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { parseItem, photoSchema, MAX_PHOTOS } from '../domain/item';
import type { Item, Photo } from '../domain/item';
import { loadItem } from './capture-repository';
import { z } from 'zod';

function identity(photos: Photo[]): string {
  return JSON.stringify(
    photos.map((photo) => ({
      id: photo.id,
      files: [photo.detail, photo.thumbnail].map((file) => [
        file.storagePath,
        file.contentType,
        file.byteSize,
        file.width,
        file.height,
        file.sha256,
      ]),
    })),
  );
}
function reference(db: Firestore, inventory: string, item: Item) {
  parseItem(itemWithoutId(item), inventory, item.id);
  return doc(db, 'inventories', inventory, 'items', item.id);
}
function itemWithoutId(item: Item) {
  const { id, ...value } = item;
  void id;
  return value;
}
function eligible(item: Item) {
  if (item.recordState !== 'ready' || item.deletedAt !== null || item.coverPhotoId !== null)
    throw new Error('Only a saved item without photos can receive its first photos.');
}
async function acknowledged(db: Firestore, inventory: string, id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const item = await loadItem(db, inventory, id);
  signal.throwIfAborted();
  if (!item) throw new Error('Photo operation acknowledgment could not be verified.');
  return item;
}
export async function ensureFirstPhotos(
  db: Firestore,
  inventory: string,
  item: Item,
  input: Photo[],
  signal: AbortSignal,
): Promise<Item> {
  const photos = z.array(photoSchema).min(1).max(MAX_PHOTOS).parse(input);
  if (photos.some((photo) => photo.state !== 'pending'))
    throw new Error('New photos must be pending.');
  parseItem({ ...itemWithoutId(item), photos, coverPhotoId: null }, inventory, item.id);
  const target = reference(db, inventory, item);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(target);
    const current = { ...parseItem(snapshot.data(), inventory, item.id), id: item.id };
    if (
      identity(current.photos) === identity(photos) &&
      current.recordState === 'ready' &&
      current.deletedAt === null &&
      current.photos.every((photo) => photo.state !== 'deleting')
    )
      return;
    eligible(current);
    if (current.photos.length || current.revision !== item.revision)
      throw new Error('Photo attachment revision conflict. Refresh the item before retrying.');
    signal.throwIfAborted();
    transaction.update(target, {
      photos,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return acknowledged(db, inventory, item.id, signal);
}
export async function finishFirstPhotos(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<Item> {
  const target = reference(db, inventory, item);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(target);
    const current = { ...parseItem(snapshot.data(), inventory, item.id), id: item.id };
    if (!item.photos.length || identity(current.photos) !== identity(item.photos))
      throw new Error('Photo attachment changed. Refresh before retrying.');
    if (
      current.recordState === 'ready' &&
      current.deletedAt === null &&
      current.photos.every((photo) => photo.state === 'ready')
    )
      return;
    eligible(current);
    if (
      current.revision !== item.revision ||
      !current.photos.every((photo) => photo.state === 'pending')
    )
      throw new Error('Photo attachment revision conflict. Refresh before retrying.');
    signal.throwIfAborted();
    transaction.update(target, {
      photos: current.photos.map((photo) => ({ ...photo, state: 'ready' })),
      coverPhotoId: current.photos[0]!.id,
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  const result = await acknowledged(db, inventory, item.id, signal);
  if (!result.photos.length || !result.photos.every((photo) => photo.state === 'ready'))
    throw new Error('Photo completion acknowledgment could not be verified.');
  return result;
}
export async function markPhotoCancellation(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<Item> {
  const target = reference(db, inventory, item);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(target);
    const current = { ...parseItem(snapshot.data(), inventory, item.id), id: item.id };
    eligible(current);
    if (current.photos.length === 0) return;
    if (identity(current.photos) !== identity(item.photos))
      throw new Error('Attachment changed. Refresh before cleanup.');
    if (current.photos.every((photo) => photo.state === 'deleting')) return;
    if (
      current.revision !== item.revision ||
      !current.photos.every((photo) => photo.state === 'pending')
    )
      throw new Error('Attachment revision conflict. Refresh before cleanup.');
    signal.throwIfAborted();
    transaction.update(target, {
      photos: current.photos.map((photo) => ({ ...photo, state: 'deleting' })),
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  return acknowledged(db, inventory, item.id, signal);
}
export async function finishPhotoCancellation(
  db: Firestore,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<void> {
  const target = reference(db, inventory, item);
  await runTransaction(db, async (transaction) => {
    signal.throwIfAborted();
    const snapshot = await transaction.get(target);
    const current = { ...parseItem(snapshot.data(), inventory, item.id), id: item.id };
    eligible(current);
    if (current.photos.length === 0) return;
    if (
      current.revision !== item.revision ||
      identity(current.photos) !== identity(item.photos) ||
      !current.photos.every((photo) => photo.state === 'deleting')
    )
      throw new Error('Cleanup marker changed. Refresh before retrying.');
    signal.throwIfAborted();
    transaction.update(target, {
      photos: [],
      revision: current.revision + 1,
      updatedAt: serverTimestamp(),
    });
  });
  const result = await acknowledged(db, inventory, item.id, signal);
  if (result.photos.length) throw new Error('Photo cleanup acknowledgment could not be verified.');
}
