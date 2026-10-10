import { deleteObject, getMetadata, list, ref } from 'firebase/storage';
import type { FirebaseStorage, StorageReference } from 'firebase/storage';
import type { ItemDocument } from '../domain/item';
import { idSchema } from '../domain/item';
import { missing } from './files';
import { runBounded } from './processing';

export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_SCAN_ENTRIES = 50000;
export function assertPermanentDelete(item: ItemDocument): void {
  if (item.deletedAt === null || !['ready', 'deleting'].includes(item.recordState))
    throw new Error('Permanent deletion requires an item in trash.');
  if (item.photos.some((photo) => photo.state !== 'ready'))
    throw new Error('Finish the photo operation before permanent deletion.');
}
export function validPhotoObject(path: string, inventory: string, item?: string): boolean {
  const match =
    /^inventories\/([A-Za-z0-9_-]{1,128})\/items\/([A-Za-z0-9_-]{1,128})\/photos\/[A-Za-z0-9_-]{1,128}\/(detail|thumb)\.jpg$/.exec(
      path,
    );
  return !!match && match[1] === inventory && (item === undefined || match[2] === item);
}
export type Classification = 'referenced' | 'recent' | 'candidate' | 'unexpected';
export function classifyObject(
  path: string,
  metadata: {
    timeCreated?: string | undefined;
    size?: number | undefined;
    contentType?: string | undefined;
  },
  referenced: Set<string>,
  inventory: string,
  now: number,
): Classification {
  if (!validPhotoObject(path, inventory)) return 'unexpected';
  if (referenced.has(path)) return 'referenced';
  const created = Date.parse(metadata.timeCreated ?? '');
  const maxBytes = path.endsWith('/detail.jpg') ? 8388608 : 524288;
  if (
    !Number.isFinite(created) ||
    metadata.contentType !== 'image/jpeg' ||
    !Number.isSafeInteger(metadata.size) ||
    !metadata.size ||
    metadata.size < 1 ||
    metadata.size > maxBytes
  )
    return 'unexpected';
  return now - created < ORPHAN_MIN_AGE_MS ? 'recent' : 'candidate';
}
export async function* photoObjects(
  storage: FirebaseStorage,
  inventory: string,
  signal: AbortSignal,
  item?: string,
): AsyncGenerator<StorageReference> {
  idSchema.parse(inventory);
  if (item !== undefined) idSchema.parse(item);
  const root = `inventories/${inventory}/items${item ? `/${item}` : ''}`;
  const pending = [root];
  const visited = new Set<string>();
  let entries = 0;
  while (pending.length) {
    signal.throwIfAborted();
    const folder = pending.pop()!;
    if (visited.has(folder) || (folder !== root && !folder.startsWith(root + '/')))
      throw new Error('Unexpected folder blocks safe inspection.');
    visited.add(folder);
    let token: string | undefined;
    const tokens = new Set<string>();
    do {
      signal.throwIfAborted();
      const page = await list(ref(storage, folder), {
        maxResults: 100,
        ...(token ? { pageToken: token } : {}),
      });
      signal.throwIfAborted();
      entries += page.prefixes.length + page.items.length;
      if (entries > MAX_SCAN_ENTRIES)
        throw new Error('Inspection exceeds its safety limit; no complete result can be reported.');
      for (const child of page.prefixes) {
        if (!child.fullPath.startsWith(folder + '/'))
          throw new Error('Unexpected folder blocks safe inspection.');
        pending.push(child.fullPath);
      }
      for (const object of page.items) {
        if (!object.fullPath.startsWith(folder + '/'))
          throw new Error('Unexpected object namespace.');
        yield object;
      }
      token = page.nextPageToken;
      if (token) {
        if (tokens.has(token)) throw new Error('Repeated page token blocks safe inspection.');
        tokens.add(token);
      }
    } while (token);
  }
}
export async function deleteItemPhotos(
  storage: FirebaseStorage,
  inventory: string,
  item: string,
  signal: AbortSignal,
  progress: (count: number) => void = () => {},
): Promise<void> {
  let deleted = 0;
  let batch: StorageReference[] = [];
  async function flush() {
    await runBounded(
      batch,
      2,
      async (object) => {
        signal.throwIfAborted();
        if (!validPhotoObject(object.fullPath, inventory, item))
          throw new Error(
            'Unexpected object blocks safe cleanup. Administrative review is required.',
          );
        try {
          await deleteObject(object);
        } catch (error) {
          if (!missing(error)) throw error;
        }
        signal.throwIfAborted();
        progress(++deleted);
      },
      signal,
    );
    batch = [];
  }
  for await (const object of photoObjects(storage, inventory, signal, item)) {
    batch.push(object);
    if (batch.length === 2) await flush();
  }
  if (batch.length) await flush();
  // A document must not disappear while a listed object still needs cleanup.
  for await (const object of photoObjects(storage, inventory, signal, item)) {
    void object;
    throw new Error('Photo cleanup is still pending. Retry the retained deletion marker.');
  }
  signal.throwIfAborted();
}
export async function objectMetadata(object: StorageReference, signal: AbortSignal) {
  signal.throwIfAborted();
  const metadata = await getMetadata(object);
  signal.throwIfAborted();
  return metadata;
}
