import type { FirebaseServices } from '../data/firebase';
import { loadInventory } from '../data/inventory-repository';
import { loadItems, loadRooms } from '../data/capture-repository';
import { loadBoxes } from '../data/organize-repository';
import { ensureFirstPhotos, finishFirstPhotos } from '../data/photo-attachment-repository';
import type { Item } from '../domain/item';
import { idSchema } from '../domain/item';
import { photoObjects } from '../media/cleanup';
import { ensureFile, verifiedBytes } from '../media/files';
import { runBounded } from '../media/processing';
import { photoExportPath } from './export';
import type { ExportSnapshot } from './export';
import { readArchivePhoto } from './validation';
import type { ValidatedArchive } from './validation';
import {
  assertRestoredRecord,
  beginRestore,
  claimRestoreRecord,
  completeRestore,
  destinationItem,
  finishRestoreItem,
  interruptRestore,
  loadRestoreClaims,
  loadRestoreClaim,
  loadRestoreReport,
  sourceRecordHash,
} from './restore-repository';
import type { RestoreRecord } from './restore-repository';
import { restoreKey } from './restore-state';
import type { RestoreKind, RestoreReport } from './restore-state';

async function snapshot(
  services: FirebaseServices,
  inventoryId: string,
  signal: AbortSignal,
): Promise<ExportSnapshot> {
  idSchema.parse(inventoryId);
  signal.throwIfAborted();
  const uid = services.auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in as the destination owner before restoring.');
  const [inventory, items, rooms, boxes] = await Promise.all([
    loadInventory(services.db, inventoryId, uid),
    loadItems(services.db, inventoryId),
    loadRooms(services.db, inventoryId),
    loadBoxes(services.db, inventoryId),
  ]);
  signal.throwIfAborted();
  return { inventoryId, inventory, items, rooms, boxes };
}
function records(source: ExportSnapshot): { kind: RestoreKind; record: RestoreRecord }[] {
  return [
    ...source.rooms.map((record) => ({ kind: 'room' as const, record })),
    ...source.boxes.map((record) => ({ kind: 'box' as const, record })),
    ...source.items.map((record) => ({ kind: 'item' as const, record })),
  ];
}
export async function inspectRestoreDestination(
  services: FirebaseServices,
  inventoryId: string,
  archive: ValidatedArchive,
  signal: AbortSignal,
  requireComplete = false,
): Promise<{ destination: ExportSnapshot; report: RestoreReport | null }> {
  const destination = await snapshot(services, inventoryId, signal);
  const report = await loadRestoreReport(services.db, inventoryId);
  const expected = new Map(
    records(archive.snapshot).map((entry) => [restoreKey(entry.kind, entry.record.id), entry]),
  );
  const actual = records(destination);
  const allowedFiles = new Set<string>();
  if (!report) {
    if (actual.length)
      throw new Error(
        'Destination is not empty. Existing records are preserved; choose an already-authorized empty inventory.',
      );
    if (requireComplete) throw new Error('Restore report is missing.');
  } else {
    if (
      report.exportId !== archive.manifest.exportId ||
      report.manifestSha256 !== archive.manifestSha256 ||
      JSON.stringify(report.counts) !== JSON.stringify(archive.manifest.counts)
    )
      throw new Error(
        'This destination has a different import. Select its original archive to resume.',
      );
    const claims = await loadRestoreClaims(services.db, inventoryId, report);
    const byKey = new Map(claims.map((claim) => [restoreKey(claim.kind, claim.recordId), claim]));
    if (
      claims.length !== report.claimedRecords ||
      claims.filter((c) => c.state === 'verified').length !== report.completedRecords ||
      actual.length !== claims.length
    )
      throw new Error('Restore report and destination records differ. Existing data is preserved.');
    for (const entry of actual) {
      signal.throwIfAborted();
      const key = restoreKey(entry.kind, entry.record.id);
      const claim = byKey.get(key);
      const original = expected.get(key);
      if (!claim || !original || claim.recordSha256 !== (await sourceRecordHash(original.record)))
        throw new Error('Unrelated or changed records block recovery. Existing data is preserved.');
      const mapped =
        entry.kind === 'item'
          ? destinationItem(original.record as Item, inventoryId)
          : original.record;
      assertRestoredRecord(entry.kind, entry.record, mapped, claim.state === 'pending');
      if (entry.kind === 'item')
        for (const photo of (entry.record as Item).photos) {
          allowedFiles.add(photo.detail.storagePath);
          allowedFiles.add(photo.thumbnail.storagePath);
        }
    }
    if (
      requireComplete &&
      (claims.length !== expected.size || claims.some((c) => c.state !== 'verified'))
    )
      throw new Error('Restore records are not fully verified.');
  }
  for await (const object of photoObjects(services.storage, inventoryId, signal)) {
    if (!allowedFiles.has(object.fullPath))
      throw new Error(
        'Unexpected destination photos block restore. No records or photos were removed.',
      );
  }
  signal.throwIfAborted();
  return { destination, report };
}
export async function restoreArchive(
  services: FirebaseServices,
  inventoryId: string,
  archive: ValidatedArchive,
  restoreSettings: boolean,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<void> {
  let report: RestoreReport | null = null;
  try {
    progress('Checking destination ownership and existing records…');
    const initial = await inspectRestoreDestination(services, inventoryId, archive, signal);
    report = initial.report;
    if (report?.state !== 'completed') {
      report = await beginRestore(
        services.db,
        inventoryId,
        initial.destination.inventory,
        archive,
        signal,
      );
      // The marker freezes ordinary writes. Reinspect to catch a capture committed before that lock.
      await inspectRestoreDestination(services, inventoryId, archive, signal);
      let done = 0;
      const entries = records(archive.snapshot);
      for (const { kind, record } of entries) {
        signal.throwIfAborted();
        progress(`Restoring record ${++done} of ${entries.length}…`);
        const hash = await sourceRecordHash(record);
        const restored = await claimRestoreRecord(
          services.db,
          inventoryId,
          report,
          kind,
          record,
          hash,
          signal,
        );
        if (kind !== 'item') continue;
        const expected = destinationItem(record as Item, inventoryId);
        let item = restored as Item;
        // A verified trash item must never enter the first-photo attachment transition again.
        const claim = await loadRestoreClaim(services.db, inventoryId, 'item', item.id);
        if (expected.photos.length && claim.state === 'pending') {
          item = await ensureFirstPhotos(
            services.db,
            inventoryId,
            item,
            expected.photos.map((photo) => ({ ...photo, state: 'pending' })),
            signal,
          );
          await runBounded(
            item.photos,
            1,
            async (photo) => {
              await runBounded(
                [
                  { file: photo.detail, path: photoExportPath(item.id, photo.id, 'detail') },
                  { file: photo.thumbnail, path: photoExportPath(item.id, photo.id, 'thumb') },
                ],
                2,
                async (entry) => {
                  const bytes = await readArchivePhoto(archive, entry.path, signal);
                  await ensureFile(
                    services.storage,
                    entry.file,
                    new Blob([bytes], { type: 'image/jpeg' }),
                    signal,
                    progress,
                  );
                },
                signal,
              );
            },
            signal,
          );
          if (item.photos.some((photo) => photo.state !== 'ready'))
            await finishFirstPhotos(services.db, inventoryId, item, signal);
        }
        await runBounded(
          expected.photos.flatMap((p) => [p.detail, p.thumbnail]),
          2,
          (file) => verifiedBytes(services.storage, file, signal).then(() => {}),
          signal,
        );
        await finishRestoreItem(services.db, inventoryId, report, expected, hash, signal);
      }
    }
    progress('Verifying every destination record and private photo…');
    const final = await inspectRestoreDestination(services, inventoryId, archive, signal, true);
    for (const item of final.destination.items)
      await runBounded(
        item.photos.flatMap((p) => [p.detail, p.thumbnail]),
        2,
        (file) => verifiedBytes(services.storage, file, signal).then(() => {}),
        signal,
      );
    signal.throwIfAborted();
    await completeRestore(
      services.db,
      inventoryId,
      report!,
      initial.destination.inventory,
      archive,
      restoreSettings,
      signal,
    );
    progress('Restore complete. All records and photo checksums were verified.');
  } catch (error) {
    if (report && report.state !== 'completed') {
      const confirmed = await interruptRestore(services.db, inventoryId, report.operationId);
      throw new Error(
        `${signal.aborted ? 'Restore stopped' : error instanceof Error ? error.message : 'Restore failed'}. ${confirmed ? 'Import remains unfinished; select the same archive to resume.' : 'Recovery report acknowledgment is unconfirmed; reconnect and refresh before continuing.'}`,
        { cause: error },
      );
    }
    throw error;
  }
}
