import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { parseInventory } from '../../src/domain/inventory';

const root = {
  schemaVersion: 2,
  ownerUid: 'synthetic-owner',
  displayName: 'Synthetic inventory',
  defaultCurrency: null,
  createdAt: Timestamp.fromMillis(0),
  updatedAt: Timestamp.fromMillis(0),
};

describe('external inventory policy validation', () => {
  it('accepts a valid trusted policy', () => {
    expect(parseInventory(root)).toEqual(root);
  });
  it.each([
    { ...root, ownerUid: '' },
    { ...root, ownerUid: null },
    { ...root, schemaVersion: 3 },
    { ...root, displayName: ' ' },
    { ...root, createdAt: '2026-10-10' },
    { ...root, injected: true },
    { ...root, defaultCurrency: 'not-a-currency' },
  ])('rejects malformed or unsupported policy', (value) => {
    expect(() => parseInventory(value)).toThrow();
  });
});
