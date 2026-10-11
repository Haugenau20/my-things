import { getBytes, getMetadata, ref, uploadBytesResumable } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import type { PhotoFile } from '../domain/item';
import { sha256 } from './processing';

export const PRIVATE_CACHE = 'private, no-store, max-age=0';
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
  if (
    metadata.size !== file.byteSize ||
    metadata.contentType !== 'image/jpeg' ||
    metadata.cacheControl !== PRIVATE_CACHE
  )
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
    if (!missing(error)) throw error;
  }
  signal.throwIfAborted();
  if (!source)
    throw new Error(
      'Some uploads are missing. Reselect the original photos to retry, or discard this unfinished capture.',
    );
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (
    source.type !== 'image/jpeg' ||
    bytes.length !== file.byteSize ||
    (await sha256(bytes)) !== file.sha256
  )
    throw new Error(
      'Reselected photos do not match this attempt. Choose the original files or discard and start again.',
    );
  signal.throwIfAborted();
  const task = uploadBytesResumable(ref(storage, file.storagePath), bytes, {
    contentType: 'image/jpeg',
    cacheControl: PRIVATE_CACHE,
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
  await verifiedBytes(storage, file, signal);
}
