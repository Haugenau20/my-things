import type { Item, Room } from './item';
import type { Box } from './organize';
import { DEFAULT_FILTERS, filterItems } from './organize';
import { facetOptions } from './browse';

export type BrowseRequest = { sequence: number; room: string; box: string; decision?: string };
export function overviewMatrix(items: Item[], rooms: Room[], boxes: Box[]) {
  const options = facetOptions(items, rooms, boxes, DEFAULT_FILTERS);
  const columns = options.boxes.filter((option) => option.value !== '');
  const rows = options.rooms
    .filter((option) => option.value !== '')
    .map((room) => {
      const cells = columns.map((column) => ({
        box: column.value,
        count: filterItems(items, { ...DEFAULT_FILTERS, room: room.value, box: column.value })
          .length,
      }));
      return {
        value: room.value,
        label: room.label,
        cells,
        total: cells.reduce((sum, cell) => sum + cell.count, 0),
      };
    });
  const count = (box: string) => filterItems(items, { ...DEFAULT_FILTERS, box }).length;
  const unpacked = count('unpacked');
  const gone = count('gone');
  const packed = columns
    .filter((column) => !['unpacked', 'gone'].includes(column.value))
    .reduce((sum, column) => sum + count(column.value), 0);
  return {
    rows,
    columns,
    totals: {
      unpacked,
      packed,
      gone,
      boxes: columns.filter(
        (column) => !['unpacked', 'gone'].includes(column.value) && count(column.value) > 0,
      ).length,
      total: unpacked + packed + gone,
    },
  };
}

export type SellingGroup = {
  count: number;
  unvalued: number;
  // Sums stay in bigint so many safe per-entry amounts cannot overflow; one entry per currency.
  totals: { currency: string; amountMinor: bigint }[];
};
function sellingGroup(items: Item[]): SellingGroup {
  const sums = new Map<string, bigint>();
  let unvalued = 0;
  for (const item of items) {
    if (!item.estimatedValue) unvalued += 1;
    else
      sums.set(
        item.estimatedValue.currency,
        (sums.get(item.estimatedValue.currency) ?? 0n) + BigInt(item.estimatedValue.amountMinor),
      );
  }
  return {
    count: items.length,
    unvalued,
    totals: [...sums]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amountMinor]) => ({ currency, amountMinor })),
  };
}
// Uses the Things filter so each line matches the list its link opens.
export function sellingSummary(items: Item[]): { open: SellingGroup; sold: SellingGroup } {
  const sell = { ...DEFAULT_FILTERS, decision: 'sell' };
  return {
    open: sellingGroup(filterItems(items, sell)),
    sold: sellingGroup(filterItems(items, { ...sell, box: 'gone' })),
  };
}
