import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDownloadURL, ref } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { verifiedBytes } from '../../src/media/files';
import {
  LOCAL_RETAIN_BYTES,
  PhotoSession,
  RETAIN_LIMIT,
  RETAIN_MS,
} from '../../src/media/photo-session';
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
  it('shares an issued URL and keeps it briefly after the photo unmounts', async () => {
    let now = 0;
    const session = new PhotoSession(storage, { now: () => now });
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
    // Scrolling back or returning to a view within the retention window reuses the URL.
    now = RETAIN_MS - 1;
    const third = await session.acquire(file, signal);
    expect(third.url).toBe(url);
    expect(getDownloadURL).toHaveBeenCalledTimes(1);
    third.release();
    // Release restarts the window; once it lapses the URL is dropped and issued again.
    now += RETAIN_MS;
    const fourth = await session.acquire(file, signal);
    expect(getDownloadURL).toHaveBeenCalledTimes(2);
    fourth.release();
    session.dispose();
  });
  it('bounds retained URLs by count', async () => {
    const session = new PhotoSession(storage, { now: () => 0 });
    const signal = new AbortController().signal;
    for (let index = 0; index <= RETAIN_LIMIT; ++index)
      (await session.acquire({ ...file, storagePath: file.storagePath + index }, signal)).release();
    expect(getDownloadURL).toHaveBeenCalledTimes(RETAIN_LIMIT + 1);
    // The oldest entry was evicted; the newest remains.
    (await session.acquire({ ...file, storagePath: file.storagePath + 0 }, signal)).release();
    (
      await session.acquire({ ...file, storagePath: file.storagePath + RETAIN_LIMIT }, signal)
    ).release();
    expect(getDownloadURL).toHaveBeenCalledTimes(RETAIN_LIMIT + 2);
    session.dispose();
  });
  it('bounds the combined size of retained local thumbnails', async () => {
    const revoked: string[] = [];
    let created = 0;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:synthetic-' + created++);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((value) => {
      revoked.push(value);
    });
    const session = new PhotoSession(storage, { now: () => 0 });
    const size = 512 * 1024;
    const count = LOCAL_RETAIN_BYTES / size + 2;
    for (let index = 0; index < count; ++index)
      session.seed(
        { ...file, storagePath: file.storagePath + index, byteSize: size },
        new Blob([new Uint8Array(size)]),
      );
    // The two oldest seeds were revoked to stay within the local byte cap.
    expect(revoked).toEqual(['blob:synthetic-0', 'blob:synthetic-1']);
    session.dispose();
    expect(revoked).toHaveLength(count);
  });
  it('drops retained URLs on sign-out', async () => {
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    (await session.acquire(file, signal)).release();
    session.dispose();
    await expect(session.acquire(file, signal)).rejects.toThrow();
  });
  it('serves seeded local thumbnails without Storage and revokes them', async () => {
    const created: string[] = [];
    const revoked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      created.push('blob:synthetic-' + created.length);
      return created.at(-1)!;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((value) => {
      revoked.push(value);
    });
    let now = 0;
    const session = new PhotoSession(storage, { now: () => now });
    const signal = new AbortController().signal;
    session.seed(file, new Blob([new Uint8Array(4)], { type: 'image/jpeg' }));
    const lease = await session.acquire(file, signal);
    expect(lease.url).toBe('blob:synthetic-0');
    expect(getDownloadURL).not.toHaveBeenCalled();
    lease.release();
    expect(revoked).toEqual([]);
    now = RETAIN_MS;
    // Expiry revokes the temporary local URL and later views use Storage.
    const later = await session.acquire(file, signal);
    expect(revoked).toEqual(['blob:synthetic-0']);
    expect(later.url).toBe(url);
    later.release();
    session.seed({ ...file, storagePath: file.storagePath + 'other' }, new Blob([]));
    session.dispose();
    expect(revoked).toEqual(['blob:synthetic-0', 'blob:synthetic-1']);
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
