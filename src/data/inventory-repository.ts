import { doc, getDocFromServer } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { parseInventory } from '../domain/inventory';
import type { Inventory } from '../domain/inventory';
import { ID_PATTERN } from './config';

export async function loadInventory(
  db: Firestore,
  inventoryId: string,
  uid: string,
): Promise<Inventory> {
  if (!ID_PATTERN.test(inventoryId) || !uid) throw new Error('Invalid inventory request');
  const snapshot = await getDocFromServer(doc(db, 'inventories', inventoryId));
  if (!snapshot.exists()) throw new Error('Inventory policy is missing');
  const inventory = parseInventory(snapshot.data());
  if (inventory.ownerUid !== uid) throw new Error('Inventory is not authorized for this identity');
  return inventory;
}
