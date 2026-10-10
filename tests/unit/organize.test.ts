import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { captureDraft } from '../../src/domain/item';
import * as organize from '../../src/domain/organize';
const time = Timestamp.fromMillis(2000);
const item = () =>
  captureDraft({ name: 'Lamp', roomId: null, reviewStatus: 'needs_review', photos: [] }, time);
describe('organization validation and metadata', () => {
  it('preserves review, serial zeroes and a zero total through partial edits', () => {
    const edited = organize.applyCommand(
      item(),
      {
        kind: 'metadata',
        patch: {
          quantity: 7,
          serialNumber: '00012',
          estimatedValue: { amountMinor: 0, currency: 'EUR' },
        },
      },
      time,
    );
    expect(edited).toMatchObject({
      reviewStatus: 'needs_review',
      serialNumber: '00012',
      quantity: 7,
      estimatedValue: { amountMinor: 0, currency: 'EUR' },
      notes: '',
    });
  });
  it('rejects undecided progress, malformed metadata and edits during an unfinished photo operation', () => {
    expect(() =>
      organize.applyCommand(item(), { kind: 'progress', progress: 'completed' }, time),
    ).toThrow();
    expect(() =>
      organize.applyCommand(item(), { kind: 'metadata', patch: { quantity: 0 } }, time),
    ).toThrow();
    expect(() =>
      organize.applyCommand(
        item(),
        { kind: 'metadata', patch: { ownerUid: 'bad' } } as never,
        time,
      ),
    ).toThrow();
    expect(() =>
      organize.applyCommand({ ...item(), recordState: 'draft' }, { kind: 'trash' }, time),
    ).toThrow();
  });
  it.each(['store', 'take'] as const)(
    'completed %s stays owned; changing decision resets completion',
    (decision) => {
      const complete = organize.applyCommand(
        organize.applyCommand(item(), { kind: 'decision', decision }, time),
        { kind: 'progress', progress: 'completed' },
        time,
      );
      expect(organize.isDisposed(complete)).toBe(false);
      expect(
        organize.applyCommand(complete, { kind: 'decision', decision: 'sell' }, time),
      ).toMatchObject({ progress: 'not_started', completedAt: null });
    },
  );
  it('searches the entire 5,000-record index and combines independent facets', () => {
    const records = Array.from({ length: 5000 }, (_, index) => ({
      ...item(),
      id: 'item-' + index,
      notes: index === 4999 ? 'Unique last record' : '',
      roomId: 'bedroom',
      boxId: 'b012',
    }));
    expect(
      organize
        .filterItems(records, { ...organize.DEFAULT_FILTERS, search: 'unique LAST' })
        .map((v) => v.id),
    ).toEqual(['item-4999']);
    expect(
      organize.filterItems(records, { ...organize.DEFAULT_FILTERS, room: 'bedroom', box: 'b012' }),
    ).toHaveLength(5000);
    expect(
      organize.filterItems(records, {
        ...organize.DEFAULT_FILTERS,
        room: 'bedroom',
        box: 'unpacked',
      }),
    ).toHaveLength(0);
  });
});
describe('exact currency amounts', () => {
  it.each([
    ['EUR', '12.34', 1234],
    ['JPY', '12', 12],
    ['KWD', '12.345', 12345],
    ['EUR', '0', 0],
  ])('parses %s %s', (currency, input, expected) => {
    expect(organize.parseMoney(input, currency)).toEqual({ amountMinor: expected, currency });
  });
  it.each([
    ['JPY', '1.1'],
    ['EUR', '1.001'],
    ['EUR', '-1'],
    ['EUR', '1e3'],
    ['EUR', '900719925474099.99'],
    ['BAD', '1'],
  ])('rejects invalid %s %s', (currency, input) => {
    expect(() => organize.parseMoney(input, currency)).toThrow();
  });
  it('formats exact values without multiplying by quantity or combining currencies', () => {
    expect(organize.moneyInput({ amountMinor: 12345, currency: 'KWD' })).toBe('12.345');
    expect(organize.moneyInput({ amountMinor: 1, currency: 'EUR' })).toBe('0.01');
  });
});
