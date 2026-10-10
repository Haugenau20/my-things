import type { FirebaseServices } from '../data/firebase';
import type { CaptureInput, Item } from '../domain/item';
import type { PreparedPhoto } from './processing';
import { runBounded } from './processing';
import { ensureFile, missing } from './files';
import {
  ensureDraft,
  finishDraft,
  markDiscard,
  deleteDiscardedDraft,
} from '../data/capture-repository';
import { deleteObject, list, ref } from 'firebase/storage';
import {
  ensureFirstPhotos,
  finishFirstPhotos,
  markPhotoCancellation,
  finishPhotoCancellation,
} from '../data/photo-attachment-repository';
export type CaptureAttempt = { id: string; input: CaptureInput; prepared: PreparedPhoto[] };
async function uploadAndFinish(
  services: FirebaseServices,
  inventory: string,
  item: Item,
  prepared: PreparedPhoto[],
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<Item> {
  signal.throwIfAborted();
  if (!services.auth.currentUser) throw new Error('Sign in before retrying this capture.');
  if (item.recordState === 'deleting')
    throw new Error('This capture is being discarded. Continue its cleanup.');
  if (item.photos.some((photo) => photo.state === 'deleting'))
    throw new Error('These photos are being discarded. Continue their cleanup.');
  const files = item.photos.flatMap((photo) => {
    const original = prepared.find((source) => source.photo.id === photo.id);
    return [
      { metadata: photo.detail, blob: original?.detail },
      { metadata: photo.thumbnail, blob: original?.thumbnail },
    ];
  });
  await runBounded(
    files,
    2,
    async (file) => ensureFile(services.storage, file.metadata, file.blob, signal, progress),
    signal,
  );
  signal.throwIfAborted();
  progress('Confirming the saved item…');
  return item.recordState === 'ready' && item.photos.length
    ? finishFirstPhotos(services.db, inventory, item, signal)
    : finishDraft(services.db, inventory, item, signal);
}
export async function attachFirstPhotos(
  services: FirebaseServices,
  inventory: string,
  item: Item,
  prepared: PreparedPhoto[],
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<Item> {
  signal.throwIfAborted();
  progress('Registering recoverable photo uploads…');
  const registered = await ensureFirstPhotos(
    services.db,
    inventory,
    item,
    prepared.map((entry) => entry.photo),
    signal,
  );
  return uploadAndFinish(services, inventory, registered, prepared, signal, progress);
}
export async function saveAttempt(
  services: FirebaseServices,
  inventory: string,
  attempt: CaptureAttempt,
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<Item> {
  signal.throwIfAborted();
  progress('Saving a recoverable draft…');
  const item = await ensureDraft(services.db, inventory, attempt.id, attempt.input, signal);
  return uploadAndFinish(services, inventory, item, attempt.prepared, signal, progress);
}
export async function recoverAttempt(
  services: FirebaseServices,
  inventory: string,
  item: Item,
  signal: AbortSignal,
  progress: (text: string) => void,
  prepared: PreparedPhoto[] = [],
): Promise<Item> {
  progress('Verifying unfinished photo uploads…');
  return uploadAndFinish(services, inventory, item, prepared, signal, progress);
}
export async function discardAttempt(
  services: FirebaseServices,
  inventory: string,
  item: Item,
  signal: AbortSignal,
): Promise<void> {
  if (item.recordState === 'ready') {
    const marker = await markPhotoCancellation(services.db, inventory, item, signal);
    await runBounded(
      marker.photos.flatMap((photo) => [photo.detail, photo.thumbnail]),
      2,
      async (file) => {
        signal.throwIfAborted();
        try {
          await deleteObject(ref(services.storage, file.storagePath));
        } catch (error) {
          if (!missing(error)) throw error;
        }
      },
      signal,
    );
    await finishPhotoCancellation(services.db, inventory, marker, signal);
    return;
  }
  const marker = await markDiscard(services.db, inventory, item, signal);
  if (!marker) return;
  const prefix = `inventories/${inventory}/items/${item.id}/photos`;
  const pending = [prefix];
  while (pending.length) {
    signal.throwIfAborted();
    const folder = pending.pop()!;
    let token: string | undefined;
    do {
      signal.throwIfAborted();
      const result = await list(ref(services.storage, folder), {
        maxResults: 100,
        ...(token ? { pageToken: token } : {}),
      });
      pending.push(...result.prefixes.map((child) => child.fullPath));
      await runBounded(
        result.items,
        2,
        async (object) => {
          if (
            !object.fullPath.startsWith(prefix + '/') ||
            !/^inventories\/[A-Za-z0-9_-]+\/items\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+\/(detail|thumb)\.jpg$/.test(
              object.fullPath,
            )
          )
            throw new Error(
              'Unexpected object blocks safe discard. Administrative review is required.',
            );
          try {
            await deleteObject(object);
          } catch (error) {
            if (!missing(error)) throw error;
          }
        },
        signal,
      );
      token = result.nextPageToken;
    } while (token);
  }
  signal.throwIfAborted();
  await deleteDiscardedDraft(services.db, inventory, marker, signal);
}
