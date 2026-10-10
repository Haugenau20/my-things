import { describe, expect, it } from 'vitest';
import {
  facetOptions,
  defaultGrouping,
  selectionTitle,
  groupVisibleItems,
} from '../../src/domain/browse';
import { DEFAULT_FILTERS } from '../../src/domain/organize';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';

describe('cross-filtered room and box facets', () => {
  const { items, rooms, boxes } = syntheticInventory();
  it('applies only the other facet plus secondary filters to each count', () => {
    const facets = facetOptions(items, rooms, boxes, {
      ...DEFAULT_FILTERS,
      room: 'seed-bedroom',
      box: 'unpacked',
    });
    expect(facets.rooms.find((room) => room.value === 'seed-bedroom')?.count).toBe(1);
    expect(facets.rooms.find((room) => room.value === 'seed-kitchen')?.count).toBe(1);
    expect(facets.boxes.find((box) => box.value === '')?.count).toBe(3);
    expect(facets.boxes.find((box) => box.value === 'seed-b002')?.count).toBe(1);
    expect(facets.boxes.find((box) => box.value === 'gone')?.count).toBe(1);
  });
  it('retains referenced archived rooms and hides unused archived rooms', () => {
    const extra = { ...rooms[2]!, id: 'unused-room', name: 'Unused archived room' };
    const facets = facetOptions(items, [...rooms, extra], boxes, DEFAULT_FILTERS);
    expect(facets.rooms.find((room) => room.value === 'seed-study')).toMatchObject({
      label: 'Synthetic old study (archived)',
      count: 1,
    });
    expect(facets.rooms.some((room) => room.value === 'unused-room')).toBe(false);
    expect(facets.rooms.find((room) => room.value === 'none')?.count).toBe(1);
  });
  it('secondary search, review and photo filters affect both rows', () => {
    const facets = facetOptions(items, rooms, boxes, {
      ...DEFAULT_FILTERS,
      search: 'Spice',
      reviewStatus: 'needs_review',
      missingPhotos: true,
    });
    expect(facets.rooms.find((room) => room.value === 'seed-kitchen')?.count).toBe(1);
    expect(facets.rooms.find((room) => room.value === 'seed-bedroom')?.count).toBe(0);
    expect(facets.boxes.find((box) => box.value === 'seed-b002')?.count).toBe(1);
  });
  it('derives grouping from the selected facet and a concrete title', () => {
    expect(defaultGrouping(DEFAULT_FILTERS)).toBe('none');
    expect(defaultGrouping({ ...DEFAULT_FILTERS, room: 'seed-bedroom' })).toBe('box');
    expect(defaultGrouping({ ...DEFAULT_FILTERS, box: 'unpacked' })).toBe('room');
    expect(defaultGrouping({ ...DEFAULT_FILTERS, room: 'seed-bedroom', box: 'seed-b002' })).toBe(
      'none',
    );
    expect(
      selectionTitle({ ...DEFAULT_FILTERS, room: 'seed-bedroom', box: 'seed-b002' }, rooms, boxes),
    ).toBe('Synthetic bedroom in B002');
  });
  it('groups only visible items without losing archived and unassigned tags', () => {
    const grouped = groupVisibleItems(
      items.filter((item) => item.boxId === null),
      'room',
      rooms,
      boxes,
    );
    expect(grouped.flatMap((group) => group.items)).toHaveLength(5);
    expect(grouped.find((group) => group.room === 'seed-study')?.label).toBe(
      'Synthetic old study (archived)',
    );
    expect(grouped.find((group) => group.room === 'none')?.items).toHaveLength(1);
    expect(groupVisibleItems(items, 'none', rooms, boxes)).toHaveLength(1);
  });
});
