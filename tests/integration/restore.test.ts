import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { deleteApp } from 'firebase/app';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { Timestamp } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { initializeFirebase } from '../../src/data/firebase';
import { assertLocalTarget } from '../../scripts/safety';
import { captureDraft, photoPath } from '../../src/domain/item';
import { loadItems, ensureDraft } from '../../src/data/capture-repository';
import { loadInventory } from '../../src/data/inventory-repository';
import { sha256 } from '../../src/media/processing';
import * as files from '../../src/media/files';
import { exportParts } from '../../src/backup/export';
import type { ExportSnapshot } from '../../src/backup/export';
import { validateArchive } from '../../src/backup/validation';
import { inspectRestoreDestination, restoreArchive } from '../../src/backup/restore';
import {
  loadRestoreReport,
  assertRestoredRecord,
  destinationItem,
  abandonUnusedRestore,
} from '../../src/backup/restore-repository';
import { createExport } from '../../src/backup/export-repository';
import * as restoreRepository from '../../src/backup/restore-repository';

const env = {
  VITE_APP_ENV: 'local',
  VITE_USE_EMULATORS: 'true',
  VITE_INVENTORY_ID: 'main',
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-inventory.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-inventory',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-inventory.firebasestorage.app',
  VITE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '19099',
  VITE_FIRESTORE_EMULATOR_PORT: '18080',
  VITE_STORAGE_EMULATOR_PORT: '19199',
};
const services = initializeFirebase(env, 'synthetic-restore-sdk');
let environment: RulesTestEnvironment;
const signal = () => new AbortController().signal;
const jpeg = new Uint8Array([
  255, 216, 255, 192, 0, 17, 8, 0, 2, 0, 2, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217,
]);
const history = new Timestamp(100, 123456000);
beforeAll(async () => {
  assertLocalTarget('demo-inventory', process.env);
  environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 19199, rules: await readFile('storage.rules', 'utf8') },
  });
  await createUserWithEmailAndPassword(
    services.auth,
    `restore-${crypto.randomUUID()}@example.invalid`,
    'synthetic-password-only',
  );
});
afterAll(async () => {
  await environment?.cleanup();
  await deleteApp(services.app);
});
async function destination(id: string) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`inventories/${id}`).set({
      schemaVersion: 2,
      ownerUid: services.auth.currentUser!.uid,
      displayName: 'Synthetic destination',
      defaultCurrency: null,
      createdAt: history,
      updatedAt: history,
    });
  });
  return id;
}
async function fixture() {
  const hash = await sha256(jpeg);
  const photo = (id: string) => ({
    id,
    state: 'ready' as const,
    detail: {
      storagePath: photoPath('synthetic-source', 'restore-item', id, 'detail'),
      contentType: 'image/jpeg' as const,
      byteSize: jpeg.length,
      width: 2,
      height: 2,
      sha256: hash,
    },
    thumbnail: {
      storagePath: photoPath('synthetic-source', 'restore-item', id, 'thumb'),
      contentType: 'image/jpeg' as const,
      byteSize: jpeg.length,
      width: 2,
      height: 2,
      sha256: hash,
    },
  });
  const source: ExportSnapshot = {
    inventoryId: 'synthetic-source',
    inventory: {
      schemaVersion: 2,
      ownerUid: 'source-authority-is-not-imported',
      displayName: 'Synthetic source name',
      defaultCurrency: 'JPY',
      createdAt: history,
      updatedAt: history,
    },
    rooms: [
      {
        id: 'old-room',
        schemaVersion: 2,
        name: 'Synthetic archived room',
        sortOrder: 0,
        revision: 4,
        createdAt: history,
        updatedAt: history,
        archivedAt: history,
      },
    ],
    boxes: [
      {
        id: 'restore-box',
        schemaVersion: 2,
        label: 'Synthetic box',
        notes: 'Box notes',
        sortOrder: 0,
        revision: 5,
        createdAt: history,
        updatedAt: history,
        archivedAt: null,
      },
    ],
    items: [
      {
        ...captureDraft(
          { name: 'Synthetic restore item', roomId: null, photos: [], reviewStatus: 'reviewed' },
          history,
        ),
        id: 'restore-item',
        quantity: 7,
        roomId: 'old-room',
        boxId: 'restore-box',
        estimatedValue: { amountMinor: 0, currency: 'JPY' },
        notes: 'Literal\næ',
        serialNumber: '00042',
        deletedAt: history,
        photos: [photo('first'), photo('second')],
        coverPhotoId: 'second',
      },
      {
        ...captureDraft(
          { name: 'Synthetic sold item', roomId: null, photos: [], reviewStatus: 'needs_review' },
          history,
        ),
        id: 'sold-item',
        roomId: 'old-room',
        boxId: null,
        decision: 'sell',
        progress: 'completed',
        completedAt: history,
      },
    ],
  };
  const archives: File[] = [];
  for await (const part of exportParts(
    source,
    async () => jpeg.buffer,
    async () => source,
    signal(),
    () => {},
    { exportId: crypto.randomUUID(), partBytes: 46 },
  ))
    archives.push(new File([part.blob], part.name));
  return { source, archive: await validateArchive(archives, signal(), () => {}) };
}
it('restores multipart history, archived locations, group values, trash, cover and private photo paths into an empty trusted destination', async () => {
  const { source, archive } = await fixture();
  const id = await destination('restore-sdk-roundtrip');
  await restoreArchive(services, id, archive, true, signal(), () => {});
  const root = await loadInventory(services.db, id, services.auth.currentUser!.uid);
  expect(root).toMatchObject({
    ownerUid: services.auth.currentUser!.uid,
    displayName: source.inventory.displayName,
    defaultCurrency: 'JPY',
  });
  expect(root.createdAt.isEqual(history)).toBe(true);
  const items = await loadItems(services.db, id);
  for (const expected of source.items)
    assertRestoredRecord(
      'item',
      items.find((i) => i.id === expected.id)!,
      destinationItem(expected, id),
    );
  expect(items[0]!.photos[0]!.detail.storagePath).toContain(`/inventories/`.slice(1) + id);
  for (const item of items)
    for (const photo of item.photos)
      for (const file of [photo.detail, photo.thumbnail])
        expect(new Uint8Array(await files.verifiedBytes(services.storage, file, signal()))).toEqual(
          jpeg,
        );
  expect((await loadRestoreReport(services.db, id))?.state).toBe('completed');
  await restoreArchive(services, id, archive, false, signal(), () => {});
  expect(await loadItems(services.db, id)).toHaveLength(2);
  const part = (await createExport(services, id, signal(), () => {}).next()).value!;
  const revalidated = await validateArchive([new File([part.blob], part.name)], signal(), () => {});
  expect(revalidated.manifest.counts).toEqual(archive.manifest.counts);
});
it('retains an interrupted import, blocks ordinary saves and export, and resumes the same archive without duplicate writes', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-resume');
  const failure = vi
    .spyOn(files, 'ensureFile')
    .mockRejectedValueOnce(new Error('Synthetic upload failure'));
  try {
    await expect(restoreArchive(services, id, archive, false, signal(), () => {})).rejects.toThrow(
      /unfinished/,
    );
  } finally {
    failure.mockRestore();
  }
  expect((await loadRestoreReport(services.db, id))?.state).toBe('interrupted');
  expect(await loadItems(services.db, id)).toHaveLength(1);
  await expect(
    ensureDraft(services.db, id, 'ordinary-capture', {
      name: 'Synthetic forbidden capture',
      roomId: null,
      photos: [],
      reviewStatus: 'needs_review',
    }),
  ).rejects.toThrow();
  await expect(createExport(services, id, signal(), () => {}).next()).rejects.toThrow(/restore/);
  const other = await fixture();
  await expect(
    restoreArchive(services, id, other.archive, false, signal(), () => {}),
  ).rejects.toThrow(/different import/);
  await expect(
    abandonUnusedRestore(services.db, id, (await loadRestoreReport(services.db, id))!),
  ).rejects.toThrow(/cannot be abandoned/);
  await restoreArchive(services, id, archive, false, signal(), () => {});
  expect(await loadItems(services.db, id)).toHaveLength(2);
  expect((await loadInventory(services.db, id, services.auth.currentUser!.uid)).displayName).toBe(
    'Synthetic destination',
  );
});
it('refuses nonempty destinations and orphan photos before creating any restore marker', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-collision');
  await ensureDraft(services.db, id, 'preserved', {
    name: 'Synthetic existing record',
    roomId: null,
    photos: [],
    reviewStatus: 'needs_review',
  });
  await expect(inspectRestoreDestination(services, id, archive, signal())).rejects.toThrow(
    /not empty/,
  );
  expect(await loadRestoreReport(services.db, id)).toBeNull();
  const orphan = await destination('restore-sdk-orphan');
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .storage('gs://demo-inventory.firebasestorage.app')
      .ref(`inventories/${orphan}/items/orphan/photos/photo/detail.jpg`)
      .put(jpeg, { contentType: 'image/jpeg' });
  });
  await expect(
    restoreArchive(services, orphan, archive, false, signal(), () => {}),
  ).rejects.toThrow(/Unexpected destination photos/);
  expect(await loadRestoreReport(services.db, orphan)).toBeNull();
});
it('preserves manually changed imported records and reports the conflict on recovery', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-conflict');
  const fail = vi.spyOn(files, 'ensureFile').mockRejectedValueOnce(new Error('Synthetic failure'));
  try {
    await expect(
      restoreArchive(services, id, archive, false, signal(), () => {}),
    ).rejects.toThrow();
  } finally {
    fail.mockRestore();
  }
  await environment.withSecurityRulesDisabled(async (context) => {
    await context
      .firestore()
      .doc(`inventories/${id}/items/restore-item`)
      .update({ notes: 'Synthetic manual change' });
  });
  await expect(restoreArchive(services, id, archive, false, signal(), () => {})).rejects.toThrow(
    /changed/,
  );
  expect((await loadItems(services.db, id))[0]!.notes).toBe('Synthetic manual change');
});
it('detects a capture raced before the import lock and releases only a report with no claimed records', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-race');
  const original = restoreRepository.beginRestore;
  const race = vi
    .spyOn(restoreRepository, 'beginRestore')
    .mockImplementationOnce(async (...args) => {
      await ensureDraft(services.db, id, 'raced-capture', {
        name: 'Synthetic raced capture',
        roomId: null,
        photos: [],
        reviewStatus: 'needs_review',
      });
      return original(...args);
    });
  try {
    await expect(restoreArchive(services, id, archive, false, signal(), () => {})).rejects.toThrow(
      /records differ/,
    );
  } finally {
    race.mockRestore();
  }
  const report = (await loadRestoreReport(services.db, id))!;
  expect(report).toMatchObject({ state: 'interrupted', claimedRecords: 0 });
  await abandonUnusedRestore(services.db, id, report);
  expect(await loadRestoreReport(services.db, id)).toBeNull();
  expect((await loadItems(services.db, id))[0]!.name).toBe('Synthetic raced capture');
});
it('reports an unconfirmed recovery write without success and can resume its still-locked import', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-unconfirmed');
  const fail = vi.spyOn(files, 'ensureFile').mockRejectedValueOnce(new Error('Synthetic failure'));
  const acknowledgment = vi
    .spyOn(restoreRepository, 'interruptRestore')
    .mockResolvedValueOnce(false);
  try {
    await expect(restoreArchive(services, id, archive, false, signal(), () => {})).rejects.toThrow(
      /acknowledgment is unconfirmed/,
    );
  } finally {
    fail.mockRestore();
    acknowledgment.mockRestore();
  }
  expect((await loadRestoreReport(services.db, id))?.state).toBe('restoring');
  await restoreArchive(services, id, archive, false, signal(), () => {});
  expect((await loadRestoreReport(services.db, id))?.state).toBe('completed');
});
it('keeps a canceled import visibly unfinished and resumes it from the same archive', async () => {
  const { archive } = await fixture();
  const id = await destination('restore-sdk-canceled');
  const controller = new AbortController();
  await expect(
    restoreArchive(services, id, archive, false, controller.signal, (message) => {
      if (message.startsWith('Restoring record 3')) controller.abort();
    }),
  ).rejects.toThrow(/Restore stopped/);
  expect((await loadRestoreReport(services.db, id))?.state).toBe('interrupted');
  expect(await loadItems(services.db, id)).toHaveLength(0);
  await restoreArchive(services, id, archive, false, signal(), () => {});
  expect((await loadRestoreReport(services.db, id))?.state).toBe('completed');
});
it('denies unsigned restore inspection and writes', async () => {
  const { archive } = await fixture();
  await signOut(services.auth);
  await expect(
    restoreArchive(services, 'restore-sdk-roundtrip', archive, false, signal(), () => {}),
  ).rejects.toThrow(/Sign in/);
});
