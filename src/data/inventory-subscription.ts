import { collection, doc, onSnapshot } from 'firebase/firestore';
import type { DocumentData, Firestore, QuerySnapshot, Unsubscribe } from 'firebase/firestore';
import { idSchema, parseItem, roomSchema } from '../domain/item';
import type { Item, Room } from '../domain/item';
import { boxSchema } from '../domain/organize';
import type { Box } from '../domain/organize';
import { parseInventory } from '../domain/inventory';
import type { Inventory } from '../domain/inventory';
import type { ListenerChange } from '../domain/live-collection';
import { subscribeRestoreReport } from '../backup/restore-repository';
import type { RestoreReport } from '../backup/restore-state';

export type InventoryListeners = {
  items: (changes: ListenerChange<Item>[]) => void;
  rooms: (changes: ListenerChange<Room>[]) => void;
  boxes: (changes: ListenerChange<Box>[]) => void;
  settings: (inventory: Inventory) => void;
  restore: (report: RestoreReport | null) => void;
  failed: (error: unknown) => void;
};

function changes<T>(
  snapshot: QuerySnapshot<DocumentData>,
  parse: (data: unknown, id: string) => T,
): ListenerChange<T>[] {
  // Parse the whole batch before applying any of it so an invalid record cannot half-apply.
  return snapshot
    .docChanges()
    .map((change) =>
      change.type === 'removed'
        ? { type: 'removed', id: change.doc.id }
        : { type: change.type, id: change.doc.id, value: parse(change.doc.data(), change.doc.id) },
    );
}

/**
 * Streams the metadata index. The first snapshot reads every record once; afterwards Firestore
 * bills only changed documents, so saves no longer re-read the whole inventory.
 */
export function subscribeInventory(
  db: Firestore,
  inventoryId: string,
  ownerUid: string,
  listeners: InventoryListeners,
): Unsubscribe {
  idSchema.parse(inventoryId);
  if (!ownerUid) throw new Error('Invalid inventory request');
  const root = doc(db, 'inventories', inventoryId);
  function collectionListener<T>(
    name: 'items' | 'rooms' | 'boxes',
    parse: (data: unknown, id: string) => T,
    next: (changes: ListenerChange<T>[]) => void,
  ): Unsubscribe {
    return onSnapshot(
      collection(root, name),
      (snapshot) => {
        let parsed: ListenerChange<T>[];
        try {
          parsed = changes(snapshot, parse);
        } catch (error) {
          listeners.failed(error);
          return;
        }
        next(parsed);
      },
      listeners.failed,
    );
  }
  const subscriptions = [
    collectionListener(
      'items',
      (data, id) => ({ ...parseItem(data, inventoryId, id), id }),
      listeners.items,
    ),
    collectionListener(
      'rooms',
      (data, id) => ({ ...roomSchema.parse(data), id: idSchema.parse(id) }),
      listeners.rooms,
    ),
    collectionListener(
      'boxes',
      (data, id) => ({ ...boxSchema.parse(data), id: idSchema.parse(id) }),
      listeners.boxes,
    ),
    onSnapshot(
      root,
      (snapshot) => {
        let inventory: Inventory;
        try {
          if (!snapshot.exists()) throw new Error('Inventory policy is missing');
          inventory = parseInventory(snapshot.data());
          if (inventory.ownerUid !== ownerUid)
            throw new Error('Inventory is not authorized for this identity');
        } catch (error) {
          listeners.failed(error);
          return;
        }
        listeners.settings(inventory);
      },
      listeners.failed,
    ),
    subscribeRestoreReport(db, inventoryId, listeners.restore, listeners.failed),
  ];
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}
