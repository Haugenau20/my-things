import { afterEach, expect, it, vi } from 'vitest';
import { list, ref } from 'firebase/storage';
import type { FirebaseStorage, StorageReference } from 'firebase/storage';
import { MAX_SCAN_ENTRIES, photoObjects } from '../../src/media/cleanup';

vi.mock('firebase/storage', async (original) => ({
  ...(await original<typeof import('firebase/storage')>()),
  list: vi.fn(),
  ref: vi.fn((_storage: FirebaseStorage, fullPath: string) => ({ fullPath })),
}));
const storage = {} as FirebaseStorage;
const reference = (path: string) => ref(storage, path);
async function collect() {
  const result: StorageReference[] = [];
  for await (const object of photoObjects(storage, 'main', new AbortController().signal))
    result.push(object);
  return result;
}
afterEach(() => {
  vi.mocked(list).mockReset();
  vi.clearAllMocks();
});
it('follows server page tokens and refuses a repeated token instead of reporting a complete scan', async () => {
  vi.mocked(list)
    .mockResolvedValueOnce({ prefixes: [], items: [], nextPageToken: 'same-token' })
    .mockResolvedValueOnce({ prefixes: [], items: [], nextPageToken: 'same-token' });
  await expect(collect()).rejects.toThrow(/Repeated page token/);
  expect(list).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ fullPath: 'inventories/main/items' }),
    { maxResults: 100, pageToken: 'same-token' },
  );
});
it('refuses a returned object outside the requested namespace', async () => {
  vi.mocked(list).mockResolvedValueOnce({
    prefixes: [],
    items: [reference('inventories/foreign/items/example/photos/photo/detail.jpg')],
  });
  await expect(collect()).rejects.toThrow(/namespace/);
});
it('fails before reporting completeness when the traversal safety limit is exceeded', async () => {
  vi.mocked(list).mockResolvedValueOnce({
    prefixes: [],
    items: Array<StorageReference>(MAX_SCAN_ENTRIES + 1).fill(
      reference('inventories/main/items/example/photos/photo/detail.jpg'),
    ),
  });
  await expect(collect()).rejects.toThrow(/safety limit/);
});
