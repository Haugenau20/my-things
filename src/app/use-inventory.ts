import { useCallback, useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import { subscribeInventory } from '../data/inventory-subscription';
import type { Inventory } from '../domain/inventory';
import type { Item, Room } from '../domain/item';
import type { Box } from '../domain/organize';
import { LiveCollection } from '../domain/live-collection';
import type { RestoreReport } from '../backup/restore-state';

/** Server-acknowledged records a save already read back; applied without another read. */
export type InventoryUpdate = {
  items?: Item[];
  removedItems?: string[];
  rooms?: Room[];
  boxes?: Box[];
  settings?: Inventory;
};
export type Sync = (update?: InventoryUpdate) => void;

type Snapshot = {
  items: Item[];
  rooms: Room[];
  boxes: Box[];
  settings: Inventory;
  restore: RestoreReport | null;
};
type Sources = 'items' | 'rooms' | 'boxes' | 'settings' | 'restore';
const SETTINGS_ID = 'inventory';

function stores() {
  return {
    items: new LiveCollection<Item>((value) => value.revision),
    rooms: new LiveCollection<Room>((value) => value.revision),
    boxes: new LiveCollection<Box>((value) => value.revision),
    settings: new LiveCollection<Inventory & { id: string }>((value) => value.updatedAt.toMillis()),
    restore: null as RestoreReport | null,
  };
}

/**
 * `paused` drops the listeners (keeping the current data) while a restore rewrites the inventory;
 * resuming resubscribes once instead of streaming every restored record as it is written.
 */
export function useInventory(
  services: FirebaseServices,
  inventoryId: string,
  initial: Inventory,
  paused = false,
) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    items: [],
    rooms: [],
    boxes: [],
    settings: initial,
    restore: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState(false);
  const [generation, setGeneration] = useState(0);
  const current = useRef(stores());
  const synced = useRef(false);
  const waiting = useRef<(() => void)[]>([]);
  const publish = useCallback(() => {
    if (!synced.current) return;
    const store = current.current;
    setSnapshot((previous) => ({
      items: store.items.values().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      rooms: store.rooms
        .values()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      boxes: store.boxes
        .values()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)),
      settings: store.settings.values()[0] ?? previous.settings,
      restore: store.restore,
    }));
  }, []);
  const ownerUid = initial.ownerUid;
  useEffect(() => {
    if (paused) return;
    // A resync builds fresh stores but keeps showing the previous data until it is complete,
    // so an explicit refresh never empties the gallery or remounts its photos.
    const store = stores();
    current.current = store;
    synced.current = false;
    const pending = new Set<Sources>(['items', 'rooms', 'boxes', 'settings', 'restore']);
    let active = true;
    const settle = () => {
      for (const wake of waiting.current.splice(0)) wake();
    };
    const arrived = (source: Sources) => {
      if (!active) return;
      pending.delete(source);
      if (!synced.current && pending.size === 0) {
        synced.current = true;
        setError(false);
        setLoading(false);
        setRefreshing(false);
        settle();
      }
      publish();
    };
    setRefreshing(true);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeInventory(services.db, inventoryId, ownerUid, {
        items: (changes) => {
          store.items.applyListener(changes);
          arrived('items');
        },
        rooms: (changes) => {
          store.rooms.applyListener(changes);
          arrived('rooms');
        },
        boxes: (changes) => {
          store.boxes.applyListener(changes);
          arrived('boxes');
        },
        settings: (inventory) => {
          store.settings.applyListener([
            { type: 'modified', id: SETTINGS_ID, value: { ...inventory, id: SETTINGS_ID } },
          ]);
          arrived('settings');
        },
        restore: (report) => {
          store.restore = report;
          arrived('restore');
        },
        failed: () => {
          if (!active) return;
          // Listeners stop after an error; Refresh inventory resubscribes.
          setError(true);
          setLoading(false);
          setRefreshing(false);
          settle();
        },
      });
    } catch {
      setError(true);
      setLoading(false);
      setRefreshing(false);
      settle();
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, [services, inventoryId, ownerUid, generation, publish, paused]);
  const sync = useCallback<Sync>(
    (update) => {
      if (!update) return;
      const store = current.current;
      for (const item of update.items ?? []) store.items.accept(item);
      for (const id of update.removedItems ?? []) store.items.acceptRemoval(id);
      for (const room of update.rooms ?? []) store.rooms.accept(room);
      for (const box of update.boxes ?? []) store.boxes.accept(box);
      if (update.settings) store.settings.accept({ ...update.settings, id: SETTINGS_ID });
      publish();
    },
    [publish],
  );
  const resync = useCallback(
    () =>
      new Promise<void>((resolve) => {
        waiting.current.push(resolve);
        setGeneration((value) => value + 1);
      }),
    [],
  );
  return { ...snapshot, loading, refreshing, error, sync, resync };
}
