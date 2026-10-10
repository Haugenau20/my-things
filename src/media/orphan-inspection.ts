import type { FirebaseServices } from '../data/firebase';
import { loadItems } from '../data/capture-repository';
import { classifyObject, objectMetadata, photoObjects, validPhotoObject } from './cleanup';
import { missing } from './files';

export type OrphanInspection = {
  inspected: number;
  referenced: number;
  recent: number;
  missingDuringScan: number;
  findings: {
    path: string;
    kind: 'candidate' | 'unexpected';
    byteSize: number | null;
    createdAt: string | null;
  }[];
};
export async function inspectOrphans(
  services: FirebaseServices,
  inventory: string,
  signal: AbortSignal,
  progress: (count: number) => void,
): Promise<OrphanInspection> {
  signal.throwIfAborted();
  const before = await loadItems(services.db, inventory);
  const referenced = new Set(
    before.flatMap((item) =>
      item.photos.flatMap((photo) => [photo.detail.storagePath, photo.thumbnail.storagePath]),
    ),
  );
  const revisions = JSON.stringify(before.map((item) => [item.id, item.revision]));
  const now = Date.now();
  const result: OrphanInspection = {
    inspected: 0,
    referenced: 0,
    recent: 0,
    missingDuringScan: 0,
    findings: [],
  };
  for await (const object of photoObjects(services.storage, inventory, signal)) {
    ++result.inspected;
    progress(result.inspected);
    if (referenced.has(object.fullPath)) {
      ++result.referenced;
      continue;
    }
    if (!validPhotoObject(object.fullPath, inventory)) {
      result.findings.push({
        path: object.fullPath,
        kind: 'unexpected',
        byteSize: null,
        createdAt: null,
      });
      continue;
    }
    let metadata;
    try {
      metadata = await objectMetadata(object, signal);
    } catch (error) {
      if (!missing(error)) throw error;
      ++result.missingDuringScan;
      continue;
    }
    const kind = classifyObject(object.fullPath, metadata, referenced, inventory, now);
    if (kind === 'recent') ++result.recent;
    else if (kind === 'candidate' || kind === 'unexpected')
      result.findings.push({
        path: object.fullPath,
        kind,
        byteSize: metadata.size,
        createdAt: metadata.timeCreated,
      });
  }
  const after = await loadItems(services.db, inventory);
  signal.throwIfAborted();
  if (JSON.stringify(after.map((item) => [item.id, item.revision])) !== revisions)
    throw new Error('Inventory changed during inspection. Refresh and run the preview again.');
  return result;
}
