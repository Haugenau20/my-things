import type { Item, Room } from './item';
import type { Box } from './organize';
import { DEFAULT_FILTERS, filterItems } from './organize';
import { facetOptions } from './browse';

export type BrowseRequest = { sequence: number; room: string; box: string };
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
