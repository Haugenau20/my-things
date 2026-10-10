import { describe, expect, it, vi } from 'vitest';
import { PhoneCaptureQueue, MAX_QUEUED_CAPTURES } from '../../src/media/phone-capture-queue';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';
import type { Item } from '../../src/domain/item';
function deferred() {
  let resolve!: (item: Item) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Item>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const saved = syntheticInventory().items[0]!;
describe('bounded phone capture queue', () => {
  it('rejects malformed inputs and excess files without consuming queue capacity', () => {
    const queue = new PhoneCaptureQueue(
      async () => saved,
      () => {},
      () => {},
    );
    expect(() => queue.enqueue('', null, [])).toThrow();
    expect(() => queue.enqueue('Synthetic', '../bad', [])).toThrow();
    expect(() =>
      queue.enqueue(
        'Synthetic',
        null,
        Array.from({ length: 3 }, () => new File(['a'], 'a.png')),
      ),
    ).toThrow(/two/);
    expect(queue.snapshot()).toEqual([]);
  });
  it('allows editing only a failed capture that never attempted a server write', async () => {
    const queue = new PhoneCaptureQueue(
      async () => {
        throw new Error('Synthetic decode failure');
      },
      () => {},
      () => {},
    );
    const source = new File(['synthetic'], 'source.png');
    queue.enqueue('Synthetic', null, [source]);
    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('failed'));
    const original = queue.editFailed();
    expect(original.files[0]).toBe(source);
    expect(queue.snapshot()).toEqual([]);
    queue.dispose();
  });
  it('runs sequentially, retains stable attempts and only reports acknowledged saves', async () => {
    const pending = deferred();
    const saves: Item[] = [];
    const worker = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ...saved, id: 'second' });
    const queue = new PhoneCaptureQueue(
      worker,
      () => {},
      (item) => {
        saves.push(item);
      },
    );
    const first = queue.enqueue('First', null, []);
    queue.enqueue('Second', null, []);
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(1));
    expect(saves).toEqual([]);
    expect(queue.snapshot().map((entry) => entry.status)).toEqual(['uploading', 'queued']);
    pending.resolve({ ...saved, id: first });
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    expect(worker).toHaveBeenCalledTimes(2);
    expect(queue.snapshot()).toEqual([]);
  });
  it('keeps failures and source files, pauses later captures and retries the same identity', async () => {
    const pending = deferred();
    const file = new File(['synthetic'], 'test.png', { type: 'image/png' });
    const worker = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(saved);
    const queue = new PhoneCaptureQueue(
      worker,
      () => {},
      () => {},
    );
    const id = queue.enqueue('First', null, [file]);
    queue.enqueue('Second', null, []);
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(1));
    pending.reject(new Error('Synthetic failure'));
    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('failed'));
    expect(worker).toHaveBeenCalledTimes(1);
    expect(queue.snapshot()[0]?.files[0]).toBe(file);
    expect(queue.snapshot()[0]?.id).toBe(id);
    queue.retry();
    await vi.waitFor(() => expect(worker).toHaveBeenCalledTimes(3));
    expect(worker.mock.calls[1]![0].id).toBe(id);
    expect(queue.snapshot()).toEqual([]);
  });
  it('refuses capacity overflow without dropping an earlier entry', async () => {
    const pending = deferred();
    const queue = new PhoneCaptureQueue(
      () => pending.promise,
      () => {},
      () => {},
    );
    for (let i = 0; i < MAX_QUEUED_CAPTURES; i++) queue.enqueue('Synthetic ' + i, null, []);
    const ids = queue.snapshot().map((entry) => entry.id);
    expect(() => queue.enqueue('Overflow', null, [])).toThrow(/queue/i);
    expect(queue.snapshot().map((entry) => entry.id)).toEqual(ids);
    queue.dispose();
  });
  it('disposing releases source files and suppresses late success callbacks', async () => {
    const pending = deferred();
    const success = vi.fn();
    const queue = new PhoneCaptureQueue(
      () => pending.promise,
      () => {},
      success,
    );
    queue.enqueue('Synthetic', null, [new File(['a'], 'a.png')]);
    await vi.waitFor(() => expect(queue.snapshot()[0]?.status).toBe('uploading'));
    queue.dispose();
    pending.resolve(saved);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.snapshot()).toEqual([]);
    expect(success).not.toHaveBeenCalled();
    expect(() => queue.enqueue('After disposal', null, [])).toThrow(/closed/i);
  });
});
