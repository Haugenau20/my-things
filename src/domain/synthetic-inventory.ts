import { Timestamp } from 'firebase/firestore';
import { captureDraft } from './item.ts';
import type { Item, Room } from './item.ts';
import { applyCommand } from './organize.ts';
import type { Box } from './organize.ts';

// Development examples contain synthetic names only and never supply authorization.
export function syntheticInventory(): { items: Item[]; rooms: Room[]; boxes: Box[] } {
  const time = Timestamp.fromMillis(Date.UTC(2026, 9, 10));
  const base = {
    schemaVersion: 2 as const,
    revision: 1,
    sortOrder: 0,
    createdAt: time,
    updatedAt: time,
    archivedAt: null,
  };
  const rooms: Room[] = [
    { ...base, id: 'seed-bedroom', name: 'Synthetic bedroom' },
    { ...base, id: 'seed-kitchen', name: 'Synthetic kitchen', sortOrder: 1 },
    { ...base, id: 'seed-study', name: 'Synthetic old study', sortOrder: 2, archivedAt: time },
  ];
  const boxes: Box[] = [
    { ...base, id: 'seed-b001', label: 'B001', notes: '' },
    { ...base, id: 'seed-b002', label: 'B002', notes: '', sortOrder: 1 },
  ];
  const entries = [
    ['Wool blanket', 'seed-bedroom', null],
    ['Reading lamp', 'seed-bedroom', 'seed-b001'],
    ['Linen sheets', 'seed-bedroom', 'seed-b002'],
    ['Ceramic bowls', 'seed-kitchen', null],
    ['Spice jars', 'seed-kitchen', 'seed-b002'],
    ['Desk lamp', 'seed-study', null],
    ['Mirror', 'seed-bedroom', null],
    ['Picture frames', null, null],
  ] as const;
  const items = entries.map(([name, roomId, boxId], index) => {
    let record = captureDraft(
      {
        name: `Synthetic ${name}`,
        roomId,
        photos: [],
        reviewStatus: index % 2 ? 'reviewed' : 'needs_review',
      },
      time,
    );
    record = { ...record, boxId, createdAt: Timestamp.fromMillis(time.toMillis() + index * 1000) };
    if (index === 6)
      record = applyCommand(
        applyCommand(record, { kind: 'decision', decision: 'sell' }, time),
        { kind: 'progress', progress: 'completed' },
        time,
      );
    return { ...record, id: `seed-item-${index}` };
  });
  return { items, rooms, boxes };
}
