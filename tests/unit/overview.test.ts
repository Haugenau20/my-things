import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { overviewMatrix, sellingSummary } from '../../src/domain/overview';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';
import { DEFAULT_FILTERS, applyCommand, filterItems, moneyInput } from '../../src/domain/organize';
import { captureDraft } from '../../src/domain/item';
import type { Item } from '../../src/domain/item';
describe('shared-filter overview', () => {
  it('counts every Room by Box cell using the Things filter and includes Gone separately', () => {
    const fixture = syntheticInventory();
    const matrix = overviewMatrix(fixture.items, fixture.rooms, fixture.boxes);
    expect(matrix.columns.map((column) => column.value)).toEqual([
      'unpacked',
      'seed-b001',
      'seed-b002',
      'gone',
    ]);
    for (const row of matrix.rows)
      for (const cell of row.cells)
        expect(cell.count).toBe(
          filterItems(fixture.items, { ...DEFAULT_FILTERS, room: row.value, box: cell.box }).length,
        );
    expect(
      matrix.rows.find((row) => row.value === 'seed-bedroom')?.cells.map((cell) => cell.count),
    ).toEqual([1, 1, 1, 1]);
    expect(matrix.rows.find((row) => row.value === 'seed-bedroom')?.total).toBe(4);
    expect(matrix.totals).toEqual({ unpacked: 4, packed: 3, gone: 1, boxes: 2, total: 8 });
  });
  it('includes active and referenced archived rooms, omits unreferenced archived and Trash', () => {
    const fixture = syntheticInventory();
    const now = Timestamp.now();
    const empty = { ...fixture.rooms[2]!, id: 'empty-archive', name: 'Empty archive' };
    const trash = { ...fixture.items[0]!, id: 'trashed', roomId: 'empty-archive', deletedAt: now };
    const matrix = overviewMatrix(
      [...fixture.items, trash],
      [...fixture.rooms, empty],
      fixture.boxes,
    );
    expect(matrix.rows.map((row) => row.value)).toEqual([
      'seed-bedroom',
      'seed-kitchen',
      'seed-study',
      'none',
    ]);
    expect(matrix.rows.find((row) => row.value === 'seed-study')?.label).toContain('(archived)');
    expect(matrix.totals.total).toBe(8);
  });
  it('omits No room when unreferenced and excludes drafts and archived boxes', () => {
    const fixture = syntheticInventory();
    const items = fixture.items.filter((item) => item.roomId !== null);
    items.push({ ...fixture.items[0]!, id: 'draft-example', roomId: null, recordState: 'draft' });
    const archived = {
      ...fixture.boxes[0]!,
      id: 'empty-box',
      label: 'Empty',
      archivedAt: Timestamp.now(),
    };
    const matrix = overviewMatrix(items, fixture.rooms, [...fixture.boxes, archived]);
    expect(matrix.rows.some((row) => row.value === 'none')).toBe(false);
    expect(matrix.columns.some((column) => column.value === 'empty-box')).toBe(false);
    expect(matrix.totals.total).toBe(7);
  });
});

describe('selling summary', () => {
  const time = Timestamp.fromMillis(Date.UTC(2026, 10, 22));
  function entry(
    id: string,
    value: Item['estimatedValue'],
    options: {
      decision?: 'sell' | 'give_away' | 'store';
      progress?: 'in_progress' | 'completed';
    } = {},
  ): Item {
    const document = captureDraft(
      { name: 'Synthetic sale entry', roomId: null, photos: [], reviewStatus: 'reviewed' },
      time,
    );
    let record = { ...document, estimatedValue: value };
    if (options.decision !== undefined)
      record = applyCommand(record, { kind: 'decision', decision: options.decision }, time);
    if (options.progress !== undefined)
      record = applyCommand(record, { kind: 'progress', progress: options.progress }, time);
    return { ...record, id };
  }
  it('totals open and sold sell entries per currency without multiplying quantity', () => {
    const items = [
      { ...entry('a', { amountMinor: 10050, currency: 'DKK' }, { decision: 'sell' }), quantity: 4 },
      entry(
        'b',
        { amountMinor: 2000, currency: 'DKK' },
        { decision: 'sell', progress: 'in_progress' },
      ),
      entry('c', { amountMinor: 0, currency: 'DKK' }, { decision: 'sell' }),
      entry('d', { amountMinor: 1500, currency: 'EUR' }, { decision: 'sell' }),
      entry('e', null, { decision: 'sell' }),
      entry(
        'f',
        { amountMinor: 70000, currency: 'DKK' },
        { decision: 'sell', progress: 'completed' },
      ),
      entry('g', null, { decision: 'sell', progress: 'completed' }),
    ];
    expect(sellingSummary(items)).toEqual({
      open: {
        count: 5,
        unvalued: 1,
        totals: [
          { currency: 'DKK', amountMinor: 12050n },
          { currency: 'EUR', amountMinor: 1500n },
        ],
      },
      sold: { count: 2, unvalued: 1, totals: [{ currency: 'DKK', amountMinor: 70000n }] },
    });
  });
  it('ignores other decisions, drafts and Trash', () => {
    const value = { amountMinor: 500, currency: 'DKK' };
    const items = [
      entry('keep', value),
      entry('store', value, { decision: 'store' }),
      entry('gift', value, { decision: 'give_away', progress: 'completed' }),
      { ...entry('draft', value, { decision: 'sell' }), recordState: 'draft' as const },
      { ...entry('trash', value, { decision: 'sell' }), deletedAt: time },
    ];
    const empty = { count: 0, unvalued: 0, totals: [] };
    expect(sellingSummary(items)).toEqual({ open: empty, sold: empty });
  });
  it('sums beyond a single safe amount and formats with the currency digits', () => {
    const big = { amountMinor: Number.MAX_SAFE_INTEGER, currency: 'KWD' };
    const total = sellingSummary([
      entry('x', big, { decision: 'sell' }),
      entry('y', big, { decision: 'sell' }),
    ]).open.totals[0]!;
    expect(total.amountMinor).toBe(2n * BigInt(Number.MAX_SAFE_INTEGER));
    expect(moneyInput(total)).toBe('18014398509481.982');
    expect(moneyInput({ amountMinor: 1205n, currency: 'JPY' })).toBe('1205');
  });
});
