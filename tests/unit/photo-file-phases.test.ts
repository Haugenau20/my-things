import { beforeEach, expect, it, vi } from 'vitest';
import { getMetadata, getBytes, uploadBytesResumable } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { ensureFile, PRIVATE_CACHE } from '../../src/media/files';
import { sha256 } from '../../src/media/processing';
vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  getMetadata: vi.fn(),
  getBytes: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));
const bytes = new Uint8Array([255, 216, 255, 217]);
const file = {
  storagePath: 'inventories/main/items/private/photos/private/detail.jpg',
  byteSize: bytes.length,
  sha256: await sha256(bytes),
  contentType: 'image/jpeg' as const,
  width: 2,
  height: 2,
};
const source = new Blob([bytes], { type: 'image/jpeg' });
const signal = new AbortController().signal;
const storage = {} as FirebaseStorage;
beforeEach(() => vi.resetAllMocks());
it('labels pre-upload inspection as verification without starting an upload', async () => {
  vi.mocked(getMetadata).mockRejectedValue({ code: 'storage/unauthorized', message: 'private' });
  await expect(ensureFile(storage, file, source, signal, () => {})).rejects.toMatchObject({
    phase: 'verification',
    code: 'storage/unauthorized',
  });
  expect(uploadBytesResumable).not.toHaveBeenCalled();
});
it('labels failed transfers as upload and allows a verified retry', async () => {
  vi.mocked(getMetadata).mockRejectedValueOnce({ code: 'storage/object-not-found' });
  vi.mocked(uploadBytesResumable).mockImplementation(
    () =>
      ({
        on: (_event: unknown, _progress: unknown, error: (failure: unknown) => void) =>
          error({ code: 'storage/unauthorized', message: 'private' }),
        cancel: vi.fn(),
      }) as unknown as ReturnType<typeof uploadBytesResumable>,
  );
  await expect(ensureFile(storage, file, source, signal, () => {})).rejects.toMatchObject({
    phase: 'upload',
    code: 'storage/unauthorized',
  });
  vi.mocked(getMetadata).mockResolvedValue({
    size: bytes.length,
    contentType: 'image/jpeg',
    cacheControl: PRIVATE_CACHE,
  } as Awaited<ReturnType<typeof getMetadata>>);
  vi.mocked(getBytes).mockResolvedValue(bytes.buffer);
  await expect(ensureFile(storage, file, source, signal, () => {})).resolves.toBeUndefined();
  expect(uploadBytesResumable).toHaveBeenCalledTimes(1);
});
it('labels post-upload byte failures as verification', async () => {
  vi.mocked(getMetadata)
    .mockRejectedValueOnce({ code: 'storage/object-not-found' })
    .mockResolvedValue({
      size: bytes.length,
      contentType: 'image/jpeg',
      cacheControl: PRIVATE_CACHE,
    } as Awaited<ReturnType<typeof getMetadata>>);
  vi.mocked(uploadBytesResumable).mockImplementation(
    () =>
      ({
        on: (_event: unknown, _progress: unknown, _error: unknown, complete: () => void) =>
          complete(),
        cancel: vi.fn(),
      }) as unknown as ReturnType<typeof uploadBytesResumable>,
  );
  vi.mocked(getBytes).mockResolvedValue(new Uint8Array([0, 0, 0, 0]).buffer);
  await expect(ensureFile(storage, file, source, signal, () => {})).rejects.toMatchObject({
    phase: 'verification',
    code: 'unknown',
  });
});

it('reports missing original bytes as verification and retains reselection guidance', async () => {
  vi.mocked(getMetadata).mockRejectedValue({ code: 'storage/object-not-found' });
  await expect(ensureFile(storage, file, undefined, signal, () => {})).rejects.toMatchObject({
    phase: 'verification',
    code: 'photo/source-missing',
  });
  expect(uploadBytesResumable).not.toHaveBeenCalled();
});
it('reports changed source bytes as verification before upload', async () => {
  vi.mocked(getMetadata).mockRejectedValue({ code: 'storage/object-not-found' });
  await expect(
    ensureFile(
      storage,
      file,
      new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      signal,
      () => {},
    ),
  ).rejects.toMatchObject({ phase: 'verification', code: 'photo/source-mismatch' });
  expect(uploadBytesResumable).not.toHaveBeenCalled();
});
