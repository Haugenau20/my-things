import { photoPhase, PhotoOperationFailure } from './capture-errors';
import { getBytes, getMetadata, ref, uploadBytesResumable } from 'firebase/storage';
import type { FirebaseStorage, FullMetadata } from 'firebase/storage';
import type { PhotoFile } from '../domain/item';
import { sha256 } from './processing';
import { md5Base64 } from './md5';
import { LEGACY_PHOTO_CACHE, PHOTO_CACHE } from './cache-policy';

export { LEGACY_PHOTO_CACHE, PHOTO_CACHE };

const ACCEPTED_CACHE = new Set([PHOTO_CACHE, LEGACY_PHOTO_CACHE]);
function expectedMetadata(metadata: FullMetadata, file: PhotoFile): boolean {
  return (
    metadata.size === file.byteSize &&
    metadata.contentType === 'image/jpeg' &&
    ACCEPTED_CACHE.has(metadata.cacheControl ?? '')
  );
}
export function missing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'storage/object-not-found'
  );
}
export async function verifiedBytes(
  storage: FirebaseStorage,
  file: PhotoFile,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  signal.throwIfAborted();
  const reference = ref(storage, file.storagePath);
  const metadata = await getMetadata(reference);
  signal.throwIfAborted();
  if (!expectedMetadata(metadata, file))
    throw new Error('Stored photo metadata does not match the capture.');
  const bytes = await getBytes(reference, file.byteSize);
  signal.throwIfAborted();
  if (bytes.byteLength !== file.byteSize || (await sha256(new Uint8Array(bytes))) !== file.sha256)
    throw new Error(
      'Stored photo checksum does not match. Discard or investigate this unfinished capture.',
    );
  signal.throwIfAborted();
  return bytes;
}
export async function ensureFile(
  storage: FirebaseStorage,
  file: PhotoFile,
  source: Blob | undefined,
  signal: AbortSignal,
  progress: (text: string) => void,
): Promise<void> {
  try {
    await verifiedBytes(storage, file, signal);
    return;
  } catch (error) {
    if (!missing(error)) throw new PhotoOperationFailure('verification', error);
  }
  const bytes = await photoPhase('verification', async () => {
    signal.throwIfAborted();
    if (!source) throw new PhotoOperationFailure('verification', { code: 'photo/source-missing' });
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (
      source.type !== 'image/jpeg' ||
      bytes.length !== file.byteSize ||
      (await sha256(bytes)) !== file.sha256
    )
      throw new PhotoOperationFailure('verification', { code: 'photo/source-mismatch' });
    signal.throwIfAborted();
    return bytes;
  });
  const uploaded = await photoPhase('upload', async () => {
    signal.throwIfAborted();
    const task = uploadBytesResumable(ref(storage, file.storagePath), bytes, {
      contentType: 'image/jpeg',
      cacheControl: PHOTO_CACHE,
      customMetadata: {},
    });
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        task.cancel();
      };
      signal.addEventListener('abort', cancel, { once: true });
      task.on(
        'state_changed',
        (snapshot) =>
          progress(
            `Uploading photos · ${Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)}%`,
          ),
        (error) => {
          signal.removeEventListener('abort', cancel);
          reject(error);
        },
        () => {
          signal.removeEventListener('abort', cancel);
          resolve();
        },
      );
      if (signal.aborted) cancel();
    });
    return task.snapshot?.metadata;
  });
  await photoPhase('verification', async () => {
    signal.throwIfAborted();
    // The upload response carries the stored object's MD5. Matching it against the bytes just
    // sent (whose SHA-256 was checked above) proves the stored bytes without downloading them.
    if (uploaded?.md5Hash) {
      if (uploaded.fullPath !== file.storagePath || !expectedMetadata(uploaded, file))
        throw new Error('Stored photo metadata does not match the capture.');
      if (uploaded.md5Hash !== md5Base64(bytes))
        throw new Error(
          'Stored photo checksum does not match. Discard or investigate this unfinished capture.',
        );
      return;
    }
    // Without a reported checksum, fall back to the authenticated byte comparison.
    await verifiedBytes(storage, file, signal);
  });
}
