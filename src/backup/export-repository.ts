import type { FirebaseServices } from '../data/firebase';
import { loadInventory } from '../data/inventory-repository';
import { loadItems, loadRooms } from '../data/capture-repository';
import { loadBoxes } from '../data/organize-repository';
import { verifiedBytes } from '../media/files';
import { exportParts } from './export';
import type { ExportSnapshot } from './export';
import { loadRestoreReport } from './restore-repository';

export async function loadExportSnapshot(
  services: FirebaseServices,
  inventoryId: string,
  signal: AbortSignal,
): Promise<ExportSnapshot> {
  signal.throwIfAborted();
  const uid = services.auth.currentUser?.uid;
  if (!uid) throw new Error('Owner authentication is required for export.');
  const [inventory, items, rooms, boxes, restore] = await Promise.all([
    loadInventory(services.db, inventoryId, uid),
    loadItems(services.db, inventoryId),
    loadRooms(services.db, inventoryId),
    loadBoxes(services.db, inventoryId),
    loadRestoreReport(services.db, inventoryId),
  ]);
  signal.throwIfAborted();
  if (restore && restore.state !== 'completed')
    throw new Error('Finish the interrupted restore before exporting a full backup.');
  return { inventoryId, inventory, items, rooms, boxes };
}
export async function* createExport(
  services: FirebaseServices,
  inventoryId: string,
  signal: AbortSignal,
  progress: (message: string) => void,
) {
  progress('Reading current server records…');
  const snapshot = await loadExportSnapshot(services, inventoryId, signal);
  yield* exportParts(
    snapshot,
    (file, active) => verifiedBytes(services.storage, file, active),
    () => loadExportSnapshot(services, inventoryId, signal),
    signal,
    progress,
  );
}
