import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseStorage } from 'firebase/storage';
import { verifiedBytes } from '../../src/media/files';
import { PhotoSession } from '../../src/media/photo-session';
import type { PhotoFile } from '../../src/domain/item';

vi.mock('../../src/media/files', () => ({ verifiedBytes: vi.fn() }));
const storage = {} as FirebaseStorage;
const file: PhotoFile = {
  storagePath: 'inventories/main/items/synthetic/photos/id/detail.jpg',
  contentType: 'image/jpeg',
  byteSize: 4,
  width: 2,
  height: 2,
  sha256: 'a'.repeat(64),
};
afterEach(() => vi.restoreAllMocks());
describe('private photo session lifetime', () => {
  it('shares a mounted photo and revokes its URL after the last viewer leaves', async () => {
    vi.mocked(verifiedBytes).mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    const first = await session.acquire(file, signal);
    const second = await session.acquire(file, signal);
    expect(first.url).toBe(second.url);
    first.release();
    await Promise.resolve();
    expect(revoke).not.toHaveBeenCalled();
    second.release();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith(first.url);
    session.dispose();
  });
  it('does not create a private URL when sign-out happens during a download', async () => {
    let finish!: (value: ArrayBuffer) => void;
    vi.mocked(verifiedBytes).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const create = vi.spyOn(URL, 'createObjectURL');
    const session = new PhotoSession(storage);
    const pending = session.acquire(file, new AbortController().signal);
    session.dispose();
    finish(new Uint8Array([1, 2, 3, 4]).buffer);
    await expect(pending).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it('bounds downloads to two and waits for a freed slot', async () => {
    const finishes: ((bytes: Uint8Array<ArrayBuffer>) => void)[] = [];
    let active = 0;
    let peak = 0;
    vi.mocked(verifiedBytes).mockImplementation(() => {
      peak = Math.max(peak, ++active);
      return new Promise((resolve) =>
        finishes.push((bytes) => {
          --active;
          resolve(bytes.buffer);
        }),
      );
    });
    const session = new PhotoSession(storage);
    const signal = new AbortController().signal;
    const tasks = [0, 1, 2].map((id) =>
      session.acquire({ ...file, storagePath: file.storagePath + id }, signal),
    );
    expect(finishes).toHaveLength(2);
    finishes[0]!(new Uint8Array(4));
    await tasks[0];
    expect(finishes).toHaveLength(3);
    finishes[1]!(new Uint8Array(4));
    finishes[2]!(new Uint8Array(4));
    const leases = await Promise.all(tasks);
    expect(peak).toBe(2);
    leases.forEach((lease) => lease.release());
    session.dispose();
  });
});
