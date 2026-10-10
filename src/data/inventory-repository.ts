import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { parseInventory } from '../domain/inventory';
import type { Inventory } from '../domain/inventory';
import { ID_PATTERN } from './config';
import { CURRENCIES } from '../domain/organize';

export async function updateSettings(
  db: Firestore,
  inventoryId: string,
  expected: Inventory,
  patch: { displayName?: string; defaultCurrency?: string | null },
): Promise<Inventory> {
  if (
    !ID_PATTERN.test(inventoryId) ||
    (patch.defaultCurrency != null && !CURRENCIES.includes(patch.defaultCurrency))
  )
    throw new Error('Choose a supported currency.');
  const target = doc(db, 'inventories', inventoryId);
  await runTransaction(db, async (tx) => {
    const current = parseInventory((await tx.get(target)).data());
    if (!current.updatedAt.isEqual(expected.updatedAt))
      throw new Error('Inventory settings changed. Refresh before retrying.');
    parseInventory({ ...current, ...patch });
    tx.update(target, { ...patch, updatedAt: serverTimestamp() });
  });
  return parseInventory((await getDocFromServer(target)).data());
}

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
