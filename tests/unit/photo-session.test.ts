import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDownloadURL, ref } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { verifiedBytes } from '../../src/media/files';
import { PhotoSession } from '../../src/media/photo-session';
import type { PhotoFile } from '../../src/domain/item';

vi.mock('../../src/media/files', () => ({ verifiedBytes: vi.fn() }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn((_storage, path: string) => ({ fullPath: path })),
}));
const storage = {} as FirebaseStorage;
const file: PhotoFile = {
  storagePath: 'inventories/main/items/synthetic/photos/id/detail.jpg',
  contentType: 'image/jpeg',
  byteSize: 4,
  width: 2,
  height: 2,
  sha256: 'a'.repeat(64),
};
const url =
  'https://firebasestorage.googleapis.com/v0/b/synthetic/o/photo.jpg?alt=media&token=synthetic';
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifiedBytes).mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);
  vi.mocked(getDownloadURL).mockResolvedValue(url);
});
afterEach(() => vi.restoreAllMocks());
describe('token photo session lifetime', () => {
  it('shares an issued URL only while a photo is mounted', async () => {
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    const first = await session.acquire(file, signal);
    const second = await session.acquire(file, signal);
    expect(first.url).toBe(second.url);
    expect(first.url).toBe(url);
    expect(ref).toHaveBeenCalledWith(storage, file.storagePath);
    expect(getDownloadURL).toHaveBeenCalledTimes(1);
    expect(verifiedBytes).not.toHaveBeenCalled();
    first.release();
    second.release();
    const third = await session.acquire(file, signal);
    expect(getDownloadURL).toHaveBeenCalledTimes(2);
    third.release();
    session.dispose();
  });
  it('suppresses a late URL when sign-out happens during issuance', async () => {
    let finish!: (value: string) => void;
    vi.mocked(getDownloadURL).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const session = new PhotoSession(storage);
    const pending = session.acquire(file, new AbortController().signal);
    session.dispose();
    finish(url);
    await expect(pending).rejects.toThrow();
    await expect(session.acquire(file, new AbortController().signal)).rejects.toThrow();
  });
  it('bounds URL requests to two and waits for a freed slot', async () => {
    const finishes: ((value: string) => void)[] = [];
    let active = 0;
    let peak = 0;
    vi.mocked(getDownloadURL).mockImplementation(() => {
      peak = Math.max(peak, ++active);
      return new Promise((resolve) =>
        finishes.push((value) => {
          --active;
          resolve(value);
        }),
      );
    });
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    const tasks = [0, 1, 2].map((id) =>
      session.acquire({ ...file, storagePath: file.storagePath + id }, signal),
    );
    expect(finishes).toHaveLength(2);
    finishes[0]!(url);
    await tasks[0];
    expect(finishes).toHaveLength(3);
    finishes[1]!(url);
    finishes[2]!(url);
    const leases = await Promise.all(tasks);
    expect(peak).toBe(2);
    leases.forEach((lease) => lease.release());
    session.dispose();
  });
  it('evicts a refused URL request so the same photo can be retried', async () => {
    vi.mocked(getDownloadURL).mockRejectedValueOnce(new Error('Synthetic URL denial'));
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    await expect(session.acquire(file, signal)).rejects.toThrow('Synthetic URL denial');
    const lease = await session.acquire(file, signal);
    expect(lease.url).toBe(url);
    expect(getDownloadURL).toHaveBeenCalledTimes(2);
    lease.release();
    session.dispose();
  });
});
