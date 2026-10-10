import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { overviewMatrix } from '../../src/domain/overview';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';
import { DEFAULT_FILTERS, filterItems } from '../../src/domain/organize';
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
