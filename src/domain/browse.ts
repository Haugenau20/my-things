import type { Item, Room } from './item';
import { filterItems, boxState } from './organize';
import type { Box, Filters } from './organize';

export type Grouping = 'room' | 'box' | 'none';
export type FacetOption = { value: string; label: string; count: number };
export type ItemGroup = { key: string; label: string; items: Item[]; room?: string; box?: string };
export function groupVisibleItems(
  items: Item[],
  grouping: Grouping,
  rooms: Room[],
  boxes: Box[],
): ItemGroup[] {
  if (!items.length) return [];
  if (grouping === 'none') return [{ key: 'all', label: '', items }];
  const groups = new Map<string, ItemGroup>();
  for (const item of items) {
    const state = boxState(item);
    const value =
      grouping === 'room' ? item.roomId : typeof state === 'string' ? state : state.boxId;
    const key = grouping + ':' + JSON.stringify(value);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label:
          grouping === 'room'
            ? roomLabel(item.roomId, rooms)
            : boxLabel(value ?? 'unpacked', boxes),
        items: [],
        ...(grouping === 'room' ? { room: item.roomId ?? 'none' } : { box: value ?? 'unpacked' }),
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}
export function defaultGrouping(filters: Filters): Grouping {
  return filters.room && !filters.box ? 'box' : filters.box && !filters.room ? 'room' : 'none';
}
export function roomLabel(id: string | null, rooms: Room[]): string {
  if (!id) return 'No room';
  const room = rooms.find((room) => room.id === id);
  return room ? room.name + (room.archivedAt ? ' (archived)' : '') : 'Unavailable room';
}
export function boxLabel(value: string, boxes: Box[]): string {
  return value === 'unpacked'
    ? 'Not packed'
    : value === 'gone'
      ? 'Gone'
      : (boxes.find((box) => box.id === value)?.label ?? 'Unavailable box');
}
export function selectionTitle(filters: Filters, rooms: Room[], boxes: Box[]): string {
  if (filters.trash) return 'Trash';
  const room = filters.room ? roomLabel(filters.room === 'none' ? null : filters.room, rooms) : '';
  const box = filters.box ? boxLabel(filters.box, boxes) : '';
  if (room && box)
    return filters.box === 'unpacked'
      ? `${room} · not packed`
      : filters.box === 'gone'
        ? `${room} · gone`
        : `${room} in ${box}`;
  return room || box || (filters.reviewStatus === 'needs_review' ? 'Review inbox' : 'All things');
}
export function facetOptions(
  items: Item[],
  rooms: Room[],
  boxes: Box[],
  filters: Filters,
): { rooms: FacetOption[]; boxes: FacetOption[] } {
  const inScope = items.filter(
    (item) =>
      item.recordState === 'ready' &&
      (filters.trash ? item.deletedAt !== null : item.deletedAt === null),
  );
  const roomOptions = [
    { value: '', label: 'All' },
    ...rooms
      .filter((room) => room.archivedAt === null || inScope.some((item) => item.roomId === room.id))
      .map((room) => ({ value: room.id, label: roomLabel(room.id, rooms) })),
    ...(inScope.some((item) => item.roomId === null) ? [{ value: 'none', label: 'No room' }] : []),
  ];
  const boxOptions = [
    { value: '', label: 'All' },
    { value: 'unpacked', label: 'Not packed' },
    ...boxes
      .filter((box) => box.archivedAt === null)
      .map((box) => ({ value: box.id, label: box.label })),
    { value: 'gone', label: 'Gone' },
  ];
  return {
    rooms: roomOptions.map((option) => ({
      ...option,
      count: filterItems(items, { ...filters, room: option.value }).length,
    })),
    boxes: boxOptions.map((option) => ({
      ...option,
      count: filterItems(items, { ...filters, box: option.value }).length,
    })),
  };
}
