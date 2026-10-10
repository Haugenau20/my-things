import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { captureDraft, photoPath } from '../../src/domain/item';
import * as cleanup from '../../src/media/cleanup';

const item = () =>
  captureDraft(
    { name: 'Synthetic cleanup', roomId: null, photos: [], reviewStatus: 'needs_review' },
    Timestamp.fromMillis(1000),
  );
describe('permanent deletion and orphan preview', () => {
  it('requires trash and completed uploads, allowing only a retryable deletion marker', () => {
    expect(() => cleanup.assertPermanentDelete(item())).toThrow(/trash/);
    expect(() =>
      cleanup.assertPermanentDelete({ ...item(), deletedAt: Timestamp.now() }),
    ).not.toThrow();
    expect(() =>
      cleanup.assertPermanentDelete({
        ...item(),
        recordState: 'deleting',
        deletedAt: Timestamp.now(),
      }),
    ).not.toThrow();
    expect(() => cleanup.assertPermanentDelete({ ...item(), recordState: 'deleting' })).toThrow();
  });
  it('skips references in any operation state, skips recent objects, and flags unknown paths', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const path = photoPath('main', 'synthetic-item', 'synthetic-photo', 'detail');
    const metadata = { timeCreated: '2026-10-08T12:00:00Z', size: 4, contentType: 'image/jpeg' };
    expect(cleanup.classifyObject(path, metadata, new Set([path]), 'main', now)).toBe('referenced');
    expect(cleanup.classifyObject(path, metadata, new Set(), 'main', now)).toBe('candidate');
    expect(
      cleanup.classifyObject(
        path,
        { ...metadata, timeCreated: '2026-10-10T11:00:00Z' },
        new Set(),
        'main',
        now,
      ),
    ).toBe('recent');
    expect(
      cleanup.classifyObject(
        path,
        { ...metadata, timeCreated: '2026-10-09T12:00:00Z' },
        new Set(),
        'main',
        now,
      ),
    ).toBe('candidate');
    expect(
      cleanup.classifyObject(path, { ...metadata, timeCreated: 'invalid' }, new Set(), 'main', now),
    ).toBe('unexpected');
    expect(
      cleanup.classifyObject(
        path,
        { ...metadata, contentType: 'text/html' },
        new Set(),
        'main',
        now,
      ),
    ).toBe('unexpected');
    expect(
      cleanup.classifyObject(
        'inventories/main/items/item-one/unknown.txt',
        metadata,
        new Set(),
        'main',
        now,
      ),
    ).toBe('unexpected');
    expect(
      cleanup.classifyObject(
        photoPath('foreign', 'synthetic-item', 'synthetic-photo', 'detail'),
        metadata,
        new Set(),
        'main',
        now,
      ),
    ).toBe('unexpected');
  });
});
