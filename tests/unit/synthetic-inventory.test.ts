import { expect, it } from 'vitest';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';
import { parseItem, roomSchema } from '../../src/domain/item';
import { boxSchema, DEFAULT_FILTERS, filterItems } from '../../src/domain/organize';

it('provides valid v2 examples for packed, unpacked, gone, review and archived-room views', () => {
  const { items, rooms, boxes } = syntheticInventory();
  expect(rooms.length).toBeGreaterThanOrEqual(2);
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  for (const { id, ...room } of rooms) {
    expect(id).toMatch(/^seed-/);
    roomSchema.parse(room);
  }
  for (const { id, ...box } of boxes) {
    expect(id).toMatch(/^seed-/);
    boxSchema.parse(box);
  }
  for (const { id, ...item } of items) parseItem(item, 'main', id);
  for (const box of ['', 'unpacked', 'gone', boxes[0]!.id, boxes[1]!.id])
    expect(filterItems(items, { ...DEFAULT_FILTERS, box }).length).toBeGreaterThan(0);
  expect(
    filterItems(items, { ...DEFAULT_FILTERS, reviewStatus: 'needs_review' }).length,
  ).toBeGreaterThan(0);
  expect(
    items.some((item) => item.roomId === rooms.find((room) => room.archivedAt !== null)?.id),
  ).toBe(true);
});
