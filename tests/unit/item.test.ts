import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { captureDraft, parseItem, photoPath } from '../../src/domain/item';

const time = Timestamp.fromMillis(1000);
const file = (variant: 'detail' | 'thumb') => ({
  storagePath: `inventories/main/items/item-one/photos/photo-one/${variant}.jpg`,
  contentType: 'image/jpeg' as const,
  byteSize: 4,
  width: 10,
  height: 8,
  sha256: 'a'.repeat(64),
});
const photo = {
  id: 'photo-one',
  state: 'pending' as const,
  detail: file('detail'),
  thumbnail: file('thumb'),
};
const input = {
  name: '  Test lamp  ',
  roomId: null,
  reviewStatus: 'needs_review' as const,
  photos: [photo],
};
describe('capture schema and defaults', () => {
  it('rejects more than two photo entries', () => {
    expect(() =>
      captureDraft(
        {
          ...input,
          photos: [photo, { ...photo, id: 'photo-two' }, { ...photo, id: 'photo-three' }],
        },
        time,
      ),
    ).toThrow();
  });
  it('creates explicit defaults without inventing a currency or location', () => {
    const draft = captureDraft(input, time);
    expect(draft).toMatchObject({
      name: 'Test lamp',
      quantity: 1,
      estimatedValue: null,
      revision: 1,
      recordState: 'draft',
      coverPhotoId: null,
      originalRoomId: null,
      currentLocation: { kind: 'unassigned' },
      deletedAt: null,
      completedAt: null,
      decision: 'undecided',
      progress: 'not_started',
    });
    expect(parseItem(draft, 'main', 'item-one')).toEqual(draft);
  });
  it('sets both room references and supports explicit reviewed capture', () => {
    expect(
      captureDraft({ ...input, roomId: 'room-one', reviewStatus: 'reviewed' }, time),
    ).toMatchObject({
      originalRoomId: 'room-one',
      currentLocation: { kind: 'room', roomId: 'room-one' },
      reviewStatus: 'reviewed',
    });
  });
  it.each(['', '  ', 'x'.repeat(201)])('rejects an invalid capture name', (name) => {
    expect(() => captureDraft({ ...input, name }, time)).toThrow();
  });
  it('rejects duplicate photo IDs and missing photos', () => {
    expect(() => captureDraft({ ...input, photos: [photo, photo] }, time)).toThrow();
    expect(() => captureDraft({ ...input, photos: [] }, time)).toThrow();
  });
  it('rejects unexpected fields and unsupported schema versions', () => {
    const draft = captureDraft(input, time);
    expect(() => parseItem({ ...draft, schemaVersion: 2 }, 'main', 'item-one')).toThrow();
    expect(() => parseItem({ ...draft, unknown: true }, 'main', 'item-one')).toThrow();
  });
  it('rejects foreign paths, invalid hashes, excessive dimensions and ambiguous locations', () => {
    const draft = captureDraft(input, time);
    for (const patch of [
      { storagePath: 'inventories/foreign/items/item-one/photos/photo-one/detail.jpg' },
      { sha256: 'not-a-hash' },
      { width: 2001 },
      { byteSize: 8388609 },
    ]) {
      expect(() =>
        parseItem(
          { ...draft, photos: [{ ...photo, detail: { ...photo.detail, ...patch } }] },
          'main',
          'item-one',
        ),
      ).toThrow();
    }
    expect(() =>
      parseItem(
        { ...draft, currentLocation: { kind: 'unassigned', roomId: 'room-one' } },
        'main',
        'item-one',
      ),
    ).toThrow();
  });
  it('requires all capture photos ready and the cover to exist before completion', () => {
    const draft = captureDraft(input, time);
    expect(() =>
      parseItem({ ...draft, recordState: 'ready', coverPhotoId: photo.id }, 'main', 'item-one'),
    ).toThrow();
    const ready = {
      ...draft,
      recordState: 'ready',
      coverPhotoId: photo.id,
      photos: [{ ...photo, state: 'ready' }],
    };
    expect(parseItem(ready, 'main', 'item-one').recordState).toBe('ready');
    expect(() => parseItem({ ...ready, coverPhotoId: 'missing' }, 'main', 'item-one')).toThrow();
  });
  it('rejects path traversal in any identifier', () => {
    expect(photoPath('main', 'item-one', 'photo-one', 'thumb')).toBe(file('thumb').storagePath);
    expect(() => photoPath('main', '../item', 'photo-one', 'detail')).toThrow();
  });
});
