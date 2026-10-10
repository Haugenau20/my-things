import type { FirebaseServices } from '../data/firebase';
import type { Item } from '../domain/item';
import { markPermanentDelete, finishPermanentDelete } from '../data/deletion-repository';
import { deleteItemPhotos } from './cleanup';

export async function permanentlyDelete(
  services: FirebaseServices,
  inventory: string,
  item: Item,
  signal: AbortSignal,
  progress: (message: string) => void,
  marked: () => Promise<void> = async () => {},
): Promise<void> {
  progress('Saving the deletion recovery marker…');
  const marker = await markPermanentDelete(services.db, inventory, item, signal);
  if (!marker) return;
  await marked();
  signal.throwIfAborted();
  progress('Removing live photo files…');
  await deleteItemPhotos(services.storage, inventory, item.id, signal, (count) =>
    progress(`Removing live photo files · ${count} removed`),
  );
  signal.throwIfAborted();
  progress('Confirming final record deletion…');
  await finishPermanentDelete(services.db, inventory, marker, signal);
}
