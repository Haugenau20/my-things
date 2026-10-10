import type { FirebaseServices } from '../data/firebase';
import type { Item } from '../domain/item';
import type { PhoneCaptureEntry } from './phone-capture-queue';
import { preparePhoto } from './processing';
import { saveAttempt } from './capture';

export async function saveQueuedCapture(
  services: FirebaseServices,
  inventory: string,
  entry: PhoneCaptureEntry,
  signal: AbortSignal,
  progress: (text: string) => void,
  registered: (id: string) => Promise<void>,
): Promise<Item> {
  signal.throwIfAborted();
  if (!entry.attempt) {
    const prepared = [];
    for (const [index, file] of entry.files.entries()) {
      progress('Preparing optimized photos…');
      prepared.push(await preparePhoto(file, inventory, entry.id, entry.photoIds[index]!, signal));
    }
    signal.throwIfAborted();
    entry.attempt = {
      id: entry.id,
      prepared,
      input: {
        name: entry.name,
        roomId: entry.roomId,
        reviewStatus: 'needs_review',
        photos: prepared.map((value) => value.photo),
      },
    };
  }
  await registered(entry.id);
  signal.throwIfAborted();
  return saveAttempt(services, inventory, entry.attempt, signal, progress);
}
