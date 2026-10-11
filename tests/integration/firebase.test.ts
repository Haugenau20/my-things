import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteApp, getApps } from 'firebase/app';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { validateConfig } from '../../src/data/config';
import { initializeFirebase } from '../../src/data/firebase';
import { loadInventory } from '../../src/data/inventory-repository';
import { LOCAL_ACCOUNTS } from '../../src/data/local-accounts';
import { seedLocal } from '../../scripts/seed';
import { assertLocalTarget } from '../../scripts/safety';
import { captureDraft, photoPath } from '../../src/domain/item';
import type { CaptureInput } from '../../src/domain/item';
import { Timestamp } from 'firebase/firestore';
import { deleteObject, getBytes, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { sha256 } from '../../src/media/processing';
import { ensureDraft, loadItems, createRoom } from '../../src/data/capture-repository';
import * as captureRepository from '../../src/data/capture-repository';
import { ensureFirstPhotos } from '../../src/data/photo-attachment-repository';
import * as captureMedia from '../../src/media/capture';
import { saveAttempt, recoverAttempt, discardAttempt } from '../../src/media/capture';
import type { CaptureAttempt } from '../../src/media/capture';
import * as organizeRepository from '../../src/data/organize-repository';
import * as deletion from '../../src/media/permanent-deletion';
import { inspectOrphans } from '../../src/media/orphan-inspection';
import { photoObjects } from '../../src/media/cleanup';
import { runBounded } from '../../src/media/processing';
import { createExport } from '../../src/backup/export-repository';
import { unzipSync } from 'fflate';

let environment: RulesTestEnvironment;
const env = {
  VITE_APP_ENV: 'local',
  VITE_USE_EMULATORS: 'true',
  VITE_INVENTORY_ID: 'main',
  VITE_FIREBASE_API_KEY: 'demo-not-a-real-api-key',
  VITE_FIREBASE_APP_ID: 'demo-app',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-inventory.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-inventory',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-inventory.firebasestorage.app',
  VITE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '19099',
  VITE_FIRESTORE_EMULATOR_PORT: '18080',
  VITE_STORAGE_EMULATOR_PORT: '19199',
};

beforeAll(async () => {
  assertLocalTarget('demo-inventory', process.env);
  environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 19199, rules: await readFile('storage.rules', 'utf8') },
  });
  await environment.clearFirestore();
});
afterAll(async () => {
  await environment?.cleanup();
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe('real client SDK and trusted synthetic seed', () => {
  it('rejects invalid configuration before any SDK app is initialized', () => {
    const count = getApps().length;
    expect(() => initializeFirebase({ ...env, VITE_STORAGE_EMULATOR_PORT: undefined })).toThrow();
    expect(getApps()).toHaveLength(count);
  });
  it('refuses any cloud seed before requests or SDK initialization', async () => {
    const count = getApps().length;
    await expect(
      seedLocal({ ...validateConfig(env), environment: 'production', emulators: null }),
    ).rejects.toThrow();
    expect(getApps()).toHaveLength(count);
  });
  it('seeds deterministic identities and policy idempotently', async () => {
    await seedLocal(validateConfig(env));
    await seedLocal(validateConfig(env));
    const services = initializeFirebase(env, 'seed-owner-test');
    const user = await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.owner.email,
      LOCAL_ACCOUNTS.owner.password,
    );
    expect(user.user.uid).toBe(LOCAL_ACCOUNTS.owner.uid);
    const policy = await getDocFromServer(doc(services.db, 'inventories/main'));
    expect(policy.data()?.ownerUid).toBe(LOCAL_ACCOUNTS.owner.uid);
    expect((await loadInventory(services.db, 'main', user.user.uid)).displayName).toBe(
      'Synthetic inventory',
    );
    await expect(
      loadInventory(services.db, 'main', LOCAL_ACCOUNTS.unrelated.uid),
    ).rejects.toThrow();
    await signOut(services.auth);
    await expect(getDocFromServer(doc(services.db, 'inventories/main'))).rejects.toThrow();
  });
  it('authenticates an unrelated account without granting inventory access', async () => {
    await seedLocal(validateConfig(env));
    const services = initializeFirebase(env, 'unrelated-test');
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    await expect(getDocFromServer(doc(services.db, 'inventories/main'))).rejects.toThrow();
  });
  async function owner(name: string) {
    await seedLocal(validateConfig(env));
    const services = initializeFirebase(env, name);
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.owner.email,
      LOCAL_ACCOUNTS.owner.password,
    );
    return services;
  }
  async function attempt(id: string): Promise<CaptureAttempt> {
    const bytes = new Uint8Array([255, 216, 255, 217]);
    const file = (variant: 'detail' | 'thumb') => ({
      storagePath: photoPath('main', id, 'photo-one', variant),
      contentType: 'image/jpeg' as const,
      byteSize: bytes.length,
      width: 2,
      height: 2,
      sha256: '',
    });
    const hash = await sha256(bytes);
    const photo = {
      id: 'photo-one',
      state: 'pending' as const,
      detail: { ...file('detail'), sha256: hash },
      thumbnail: { ...file('thumb'), sha256: hash },
    };
    const input: CaptureInput = {
      name: 'Synthetic capture',
      roomId: null,
      reviewStatus: 'needs_review',
      photos: [photo],
    };
    return {
      id,
      input,
      prepared: [
        {
          photo,
          detail: new Blob([bytes], { type: 'image/jpeg' }),
          thumbnail: new Blob([bytes], { type: 'image/jpeg' }),
        },
      ],
    };
  }

  it('acknowledges optional details with photos and binds retry identity to those details', async () => {
    const services = await owner('detailed-capture-owner');
    const plan = await attempt('sdk-detailed-capture');
    const details = {
      quantity: 7,
      estimatedValue: { amountMinor: 0, currency: 'JPY' },
      serialNumber: '0000123',
      notes: 'Synthetic details',
      category: 'Fragile',
    };
    plan.input = { ...plan.input, ...details };
    const signal = new AbortController().signal;
    const saved = await saveAttempt(services, 'main', plan, signal, () => {});
    expect(saved).toMatchObject({
      ...details,
      recordState: 'ready',
      reviewStatus: 'needs_review',
      roomId: null,
      boxId: null,
    });
    expect((await saveAttempt(services, 'main', plan, signal, () => {})).id).toBe(saved.id);
    await expect(
      saveAttempt(
        services,
        'main',
        { ...plan, input: { ...plan.input, quantity: 8 } },
        signal,
        () => {},
      ),
    ).rejects.toThrow('identity conflict');
    expect((await captureRepository.loadItem(services.db, 'main', saved.id))?.quantity).toBe(7);
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    const foreign = await attempt('sdk-foreign-detailed');
    foreign.input = { ...foreign.input, ...details };
    await expect(saveAttempt(services, 'main', foreign, signal, () => {})).rejects.toThrow();
  });

  it('saves acknowledged capture bytes and retries without duplicate records', async () => {
    const services = await owner('capture-owner');
    const plan = await attempt('sdk-capture');
    const signal = new AbortController().signal;
    const saved = await saveAttempt(services, 'main', plan, signal, () => {});
    expect(saved.recordState).toBe('ready');
    expect(saved.photos.every((photo) => photo.state === 'ready')).toBe(true);
    expect((await saveAttempt(services, 'main', plan, signal, () => {})).id).toBe(saved.id);
    expect(
      (await loadItems(services.db, 'main')).filter((item) => item.id === plan.id),
    ).toHaveLength(1);
  });
  it('requires owner authorization to issue URLs while copied tokens work until object deletion', async () => {
    const services = await owner('token-url-owner');
    const plan = await attempt('sdk-token-urls');
    const saved = await saveAttempt(services, 'main', plan, new AbortController().signal, () => {});
    const reference = ref(services.storage, saved.photos[0]!.detail.storagePath);
    const url = await getDownloadURL(reference);
    expect(new URL(url).searchParams.get('token')).toBeTruthy();
    await signOut(services.auth);
    await expect(getDownloadURL(reference)).rejects.toMatchObject({ code: 'storage/unauthorized' });
    await expect(getBytes(reference)).rejects.toMatchObject({ code: 'storage/unauthorized' });
    const copied = await fetch(url);
    expect(copied.ok).toBe(true);
    expect(new Uint8Array(await copied.arrayBuffer())).toEqual(
      new Uint8Array([255, 216, 255, 217]),
    );
    const missingToken = new URL(url);
    missingToken.searchParams.delete('token');
    expect((await fetch(missingToken)).ok).toBe(false);
    const wrongToken = new URL(url);
    wrongToken.searchParams.set('token', '00000000-0000-4000-8000-000000000000');
    expect((await fetch(wrongToken)).ok).toBe(false);
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    await expect(getDownloadURL(reference)).rejects.toMatchObject({ code: 'storage/unauthorized' });
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.owner.email,
      LOCAL_ACCOUNTS.owner.password,
    );
    await deleteObject(reference);
    expect((await fetch(url)).ok).toBe(false);
    await deleteObject(ref(services.storage, saved.photos[0]!.thumbnail.storagePath));
    await environment.withSecurityRulesDisabled((context) =>
      context.firestore().doc(`inventories/main/items/${saved.id}`).delete(),
    );
  });
  it('saves photo-free items with stable identity and attaches verified photos without changing metadata', async () => {
    const services = await owner('photo-free-attachment');
    const plan = await attempt('sdk-photo-free');
    const signal = new AbortController().signal;
    const empty = {
      ...plan,
      prepared: [],
      input: { ...plan.input, photos: [], reviewStatus: 'reviewed' as const },
    };
    const original = await saveAttempt(services, 'main', empty, signal, () => {});
    expect(original).toMatchObject({
      recordState: 'ready',
      coverPhotoId: null,
      photos: [],
      reviewStatus: 'reviewed',
    });
    expect((await saveAttempt(services, 'main', empty, signal, () => {})).id).toBe(original.id);
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`inventories/main/items/${original.id}`)
        .update({ quantity: 7, notes: 'Synthetic existing note', revision: 2 });
    });
    const current = (await captureRepository.loadItem(services.db, 'main', original.id))!;
    const attached = await captureMedia.attachFirstPhotos(
      services,
      'main',
      current,
      plan.prepared,
      signal,
      () => {},
    );
    expect(attached).toMatchObject({
      id: original.id,
      name: original.name,
      quantity: 7,
      notes: 'Synthetic existing note',
      reviewStatus: 'reviewed',
      recordState: 'ready',
      coverPhotoId: plan.input.photos[0]!.id,
    });
    expect(attached.createdAt.isEqual(original.createdAt)).toBe(true);
    expect(attached.photos.every((photo) => photo.state === 'ready')).toBe(true);
    expect(
      (
        await captureMedia.attachFirstPhotos(
          services,
          'main',
          current,
          plan.prepared,
          signal,
          () => {},
        )
      ).revision,
    ).toBe(attached.revision);
    expect(
      (await loadItems(services.db, 'main')).filter((item) => item.id === original.id),
    ).toHaveLength(1);
  });
  it('recovers interrupted first-photo uploads and preserves the photo-free item on explicit cancellation', async () => {
    const services = await owner('attachment-recovery');
    const plan = await attempt('sdk-attachment-recovery');
    const signal = new AbortController().signal;
    const original = await saveAttempt(
      services,
      'main',
      { ...plan, prepared: [], input: { ...plan.input, photos: [] } },
      signal,
      () => {},
    );
    const registered = await ensureFirstPhotos(
      services.db,
      'main',
      original,
      plan.input.photos,
      signal,
    );
    const source = plan.prepared[0]!;
    await uploadBytes(
      ref(services.storage, source.photo.detail.storagePath),
      new Uint8Array(await source.detail.arrayBuffer()),
      { contentType: 'image/jpeg', cacheControl: 'private, no-store, max-age=0' },
    );
    await expect(recoverAttempt(services, 'main', registered, signal, () => {})).rejects.toThrow();
    expect((await captureRepository.loadItem(services.db, 'main', original.id))?.recordState).toBe(
      'ready',
    );
    await recoverAttempt(services, 'main', registered, signal, () => {}, plan.prepared);
    const cancelPlan = await attempt('sdk-attachment-cancel');
    const cancelOriginal = await saveAttempt(
      services,
      'main',
      { ...cancelPlan, prepared: [], input: { ...cancelPlan.input, photos: [] } },
      signal,
      () => {},
    );
    const cancelRegistered = await ensureFirstPhotos(
      services.db,
      'main',
      cancelOriginal,
      cancelPlan.input.photos,
      signal,
    );
    await uploadBytes(
      ref(services.storage, cancelPlan.prepared[0]!.photo.detail.storagePath),
      new Uint8Array(await cancelPlan.prepared[0]!.detail.arrayBuffer()),
      { contentType: 'image/jpeg', cacheControl: 'private, no-store, max-age=0' },
    );
    await discardAttempt(services, 'main', cancelRegistered, signal);
    expect(await captureRepository.loadItem(services.db, 'main', cancelOriginal.id)).toMatchObject({
      id: cancelOriginal.id,
      name: cancelOriginal.name,
      recordState: 'ready',
      coverPhotoId: null,
      photos: [],
    });
    await expect(
      recoverAttempt(services, 'main', cancelRegistered, signal, () => {}, cancelPlan.prepared),
    ).rejects.toThrow();
  });
  it('rejects contested attachment identity and unrelated attachment writes', async () => {
    const services = await owner('attachment-conflicts');
    const plan = await attempt('sdk-attachment-conflict');
    const signal = new AbortController().signal;
    const original = await saveAttempt(
      services,
      'main',
      { ...plan, prepared: [], input: { ...plan.input, photos: [] } },
      signal,
      () => {},
    );
    await expect(
      ensureFirstPhotos(
        services.db,
        'main',
        { ...original, revision: original.revision + 1 },
        plan.input.photos,
        signal,
      ),
    ).rejects.toThrow(/revision/i);
    await ensureFirstPhotos(services.db, 'main', original, plan.input.photos, signal);
    const foreignPhotos = plan.input.photos.map((photo) => ({
      ...photo,
      id: 'different-photo',
      detail: {
        ...photo.detail,
        storagePath: photoPath('main', original.id, 'different-photo', 'detail'),
      },
      thumbnail: {
        ...photo.thumbnail,
        storagePath: photoPath('main', original.id, 'different-photo', 'thumb'),
      },
    }));
    await expect(
      ensureFirstPhotos(services.db, 'main', original, foreignPhotos, signal),
    ).rejects.toThrow();
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    await expect(
      ensureFirstPhotos(services.db, 'main', original, plan.input.photos, signal),
    ).rejects.toThrow();
  });
  it('keeps an interrupted capture visible and finishes verified uploads after reload', async () => {
    const services = await owner('capture-recovery');
    const plan = await attempt('sdk-recovery');
    const draft = await ensureDraft(services.db, 'main', plan.id, plan.input);
    const first = plan.prepared[0]!;
    await uploadBytes(
      ref(services.storage, first.photo.detail.storagePath),
      new Uint8Array(await first.detail.arrayBuffer()),
      { contentType: 'image/jpeg', cacheControl: 'private, no-store, max-age=0' },
    );
    await expect(
      recoverAttempt(services, 'main', draft, new AbortController().signal, () => {}),
    ).rejects.toThrow();
    expect(
      (await getDocFromServer(doc(services.db, `inventories/main/items/${plan.id}`))).data()
        ?.recordState,
    ).toBe('draft');
    await uploadBytes(
      ref(services.storage, first.photo.thumbnail.storagePath),
      new Uint8Array(await first.thumbnail.arrayBuffer()),
      { contentType: 'image/jpeg', cacheControl: 'private, no-store, max-age=0' },
    );
    expect(
      (await recoverAttempt(services, 'main', draft, new AbortController().signal, () => {}))
        .recordState,
    ).toBe('ready');
  });
  it('refuses hash mismatches and explicitly discards draft files before the record', async () => {
    const services = await owner('capture-discard');
    const plan = await attempt('sdk-discard');
    const draft = await ensureDraft(services.db, 'main', plan.id, plan.input);
    await uploadBytes(
      ref(services.storage, plan.prepared[0]!.photo.detail.storagePath),
      new Uint8Array([1, 2, 3, 4]),
      { contentType: 'image/jpeg' },
    );
    await expect(
      recoverAttempt(services, 'main', draft, new AbortController().signal, () => {}),
    ).rejects.toThrow();
    await discardAttempt(services, 'main', draft, new AbortController().signal);
    expect(
      (await getDocFromServer(doc(services.db, `inventories/main/items/${plan.id}`))).exists(),
    ).toBe(false);
  });
  it('creates a real room reference and rejects unrelated SDK capture writes', async () => {
    const services = await owner('capture-room');
    const room = await createRoom(services.db, 'main', 'Synthetic study', 0);
    const plan = await attempt('sdk-room');
    plan.input = { ...plan.input, roomId: room.id };
    expect(captureDraft(plan.input, Timestamp.now()).roomId).toBe(room.id);
    const saved = await saveAttempt(services, 'main', plan, new AbortController().signal, () => {});
    expect(saved.roomId).toBe(room.id);
    await signInWithEmailAndPassword(
      services.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    await expect(
      saveAttempt(
        services,
        'main',
        await attempt('sdk-foreign'),
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow();
  });
  it('organizes twenty items across rooms and a box, with conflicts and per-item bulk results', async () => {
    const services = await owner('m2-workflow');
    const room = await createRoom(services.db, 'main', 'Synthetic bedroom', 0);
    const second = await createRoom(services.db, 'main', 'Synthetic living room', 1);
    const box = await organizeRepository.createBox(services.db, 'main', 'B012', 0);
    const records = [];
    for (let index = 0; index < 20; index++)
      records.push(
        await ensureDraft(services.db, 'main', `organize-${index}`, {
          name: `Synthetic thing ${index}`,
          roomId: index < 10 ? room.id : second.id,
          photos: [],
          reviewStatus: 'needs_review',
        }),
      );
    const patched = await organizeRepository.editItem(services.db, 'main', records[0]!, {
      kind: 'metadata',
      patch: {
        quantity: 7,
        serialNumber: '00007',
        estimatedValue: { amountMinor: 0, currency: 'JPY' },
        notes: '<script>plain text</script>',
      },
    });
    await expect(
      organizeRepository.editItem(services.db, 'main', records[0]!, {
        kind: 'metadata',
        patch: { category: 'stale' },
      }),
    ).rejects.toThrow(/changed/i);
    const bulk = await organizeRepository.bulkEdit(
      services.db,
      'main',
      [records[0]!, ...records.slice(1, 10)],
      { kind: 'pack', boxId: box.id },
    );
    expect(bulk.filter((result) => result.status === 'saved')).toHaveLength(9);
    expect(bulk[0]?.status).toBe('conflict');
    expect((await captureRepository.loadItem(services.db, 'main', patched.id))?.notes).toBe(
      '<script>plain text</script>',
    );
    await expect(
      organizeRepository.archiveLocation(services.db, 'main', 'box', box.id),
    ).rejects.toThrow(/Move/);
    for (const [index, decision] of [
      [1, 'sell'],
      [2, 'give_away'],
    ] as const) {
      const current = (await captureRepository.loadItem(services.db, 'main', records[index]!.id))!;
      const decided = await organizeRepository.editItem(services.db, 'main', current, {
        kind: 'decision',
        decision,
      });
      const completed = await organizeRepository.editItem(services.db, 'main', decided, {
        kind: 'progress',
        progress: 'completed',
      });
      expect(completed.boxId).toBeNull();
      expect(completed.roomId).toBe(room.id);
      const trashed = await organizeRepository.editItem(services.db, 'main', completed, {
        kind: 'trash',
      });
      const restored = await organizeRepository.editItem(services.db, 'main', trashed, {
        kind: 'restore',
      });
      expect(restored.progress).toBe('completed');
      expect(restored.deletedAt).toBeNull();
    }
    const all = (await loadItems(services.db, 'main')).filter((record) =>
      record.id.startsWith('organize-'),
    );
    expect(all).toHaveLength(20);
    expect(all.filter((record) => record.boxId !== null)).toHaveLength(7);
    expect(all.every((record) => record.reviewStatus === 'needs_review')).toBe(true);
    const empty = await organizeRepository.createBox(services.db, 'main', 'Empty', 1);
    await organizeRepository.archiveLocation(services.db, 'main', 'box', empty.id);
    await expect(
      organizeRepository.editItem(services.db, 'main', patched, {
        kind: 'pack',
        boxId: empty.id,
      }),
    ).rejects.toThrow(/archived/);
  });
  it('archives referenced room tags and restores trash without requiring room reactivation', async () => {
    const services = await owner('archived-room-tag');
    const room = await createRoom(services.db, 'main', 'Synthetic archived room', 2);
    const current = await ensureDraft(services.db, 'main', 'archived-room-item', {
      name: 'Synthetic tagged item',
      roomId: room.id,
      photos: [],
      reviewStatus: 'needs_review',
    });
    await organizeRepository.archiveLocation(services.db, 'main', 'room', room.id);
    const saved = (await captureRepository.loadItem(services.db, 'main', current.id))!;
    expect(saved.roomId).toBe(room.id);
    const trashed = await organizeRepository.editItem(services.db, 'main', saved, {
      kind: 'trash',
    });
    const restored = await organizeRepository.editItem(services.db, 'main', trashed, {
      kind: 'restore',
    });
    expect(restored).toMatchObject({ roomId: room.id, boxId: null, deletedAt: null });
    await expect(
      ensureDraft(services.db, 'main', 'archived-room-rejected', {
        name: 'Synthetic invalid capture',
        roomId: room.id,
        photos: [],
        reviewStatus: 'needs_review',
      }),
    ).rejects.toThrow(/available/);
  });
  it('detects packing racing box archive and requires box reactivation before restoring its retained contents', async () => {
    const services = await owner('box-archive-race');
    const box = await organizeRepository.createBox(services.db, 'main', 'Synthetic race box', 3);
    const item = await ensureDraft(services.db, 'main', 'box-archive-racer', {
      name: 'Synthetic race item',
      roomId: null,
      photos: [],
      reviewStatus: 'needs_review',
    });
    const originalLoad = captureRepository.loadItems;
    const spy = vi.spyOn(captureRepository, 'loadItems').mockImplementationOnce(async (...args) => {
      const snapshot = await originalLoad(...args);
      await organizeRepository.editItem(services.db, 'main', item, { kind: 'pack', boxId: box.id });
      return snapshot;
    });
    try {
      await expect(
        organizeRepository.archiveLocation(services.db, 'main', 'box', box.id),
      ).rejects.toThrow(/changed elsewhere/);
    } finally {
      spy.mockRestore();
    }
    const packed = (await captureRepository.loadItem(services.db, 'main', item.id))!;
    const trash = await organizeRepository.editItem(services.db, 'main', packed, { kind: 'trash' });
    await organizeRepository.archiveLocation(services.db, 'main', 'box', box.id);
    await expect(
      organizeRepository.editItem(services.db, 'main', trash, { kind: 'restore' }),
    ).rejects.toThrow(/Reactivate/);
    await organizeRepository.reactivateLocation(services.db, 'main', 'box', box.id);
    const restored = await organizeRepository.editItem(services.db, 'main', trash, {
      kind: 'restore',
    });
    expect(restored.boxId).toBe(box.id);
  });
  it('loads and searches metadata beyond a 250-document server page', async () => {
    const services = await owner('m2-paging');
    await environment.withSecurityRulesDisabled(async (context) => {
      const batch = context.firestore().batch();
      for (let index = 0; index < 260; index++) {
        const id = `paging-${String(index).padStart(3, '0')}`;
        batch.set(context.firestore().doc(`inventories/main/items/${id}`), {
          ...captureDraft(
            {
              name: `Synthetic page ${index}`,
              roomId: null,
              photos: [],
              reviewStatus: 'needs_review',
            },
            Timestamp.now(),
          ),
          notes: index === 259 ? 'Synthetic final page needle' : '',
        });
      }
      await batch.commit();
    });
    const loaded = (await loadItems(services.db, 'main')).filter((item) =>
      item.id.startsWith('paging-'),
    );
    expect(loaded).toHaveLength(260);
    expect(loaded.find((item) => item.notes.includes('final page needle'))?.id).toBe('paging-259');
  });
  it('permanently deletes a trashed photo item, preserves another item, and rejects stale or nontrashed deletion', async () => {
    const services = await owner('permanent-delete');
    const plan = await attempt('permanent-photo');
    const saved = await saveAttempt(services, 'main', plan, new AbortController().signal, () => {});
    await expect(
      deletion.permanentlyDelete(services, 'main', saved, new AbortController().signal, () => {}),
    ).rejects.toThrow(/trash/);
    const trashed = await organizeRepository.editItem(services.db, 'main', saved, {
      kind: 'trash',
    });
    const unrelated = await ensureDraft(services.db, 'main', 'permanent-preserved', {
      name: 'Synthetic preserved item',
      roomId: null,
      photos: [],
      reviewStatus: 'needs_review',
    });
    await deletion.permanentlyDelete(
      services,
      'main',
      trashed,
      new AbortController().signal,
      () => {},
    );
    expect(await captureRepository.loadItem(services.db, 'main', saved.id)).toBeNull();
    await expect(
      import('firebase/storage').then(({ getMetadata }) =>
        getMetadata(ref(services.storage, saved.photos[0]!.detail.storagePath)),
      ),
    ).rejects.toMatchObject({ code: 'storage/object-not-found' });
    expect(await captureRepository.loadItem(services.db, 'main', unrelated.id)).not.toBeNull();
    const newer = await organizeRepository.editItem(services.db, 'main', unrelated, {
      kind: 'metadata',
      patch: { notes: 'Newer synthetic details' },
    });
    await expect(
      deletion.permanentlyDelete(
        services,
        'main',
        unrelated,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow(/changed/);
    const emptyTrash = await organizeRepository.editItem(services.db, 'main', newer, {
      kind: 'trash',
    });
    await deletion.permanentlyDelete(
      services,
      'main',
      emptyTrash,
      new AbortController().signal,
      () => {},
    );
    expect(await captureRepository.loadItem(services.db, 'main', unrelated.id)).toBeNull();
  });
  it('keeps a permanent marker after cancellation and unexpected objects, then retries exact-prefix cleanup', async () => {
    const services = await owner('permanent-recovery');
    const plan = await attempt('permanent-recovery');
    const saved = await saveAttempt(services, 'main', plan, new AbortController().signal, () => {});
    const trashed = await organizeRepository.editItem(services.db, 'main', saved, {
      kind: 'trash',
    });
    const controller = new AbortController();
    await expect(
      deletion.permanentlyDelete(
        services,
        'main',
        trashed,
        controller.signal,
        () => {},
        async () => controller.abort(),
      ),
    ).rejects.toThrow();
    const marker = (await captureRepository.loadItem(services.db, 'main', trashed.id))!;
    expect(marker).toMatchObject({ recordState: 'deleting', coverPhotoId: saved.coverPhotoId });
    const unexpected = `inventories/main/items/${saved.id}/unexpected.txt`;
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .storage('gs://demo-inventory.firebasestorage.app')
        .ref(unexpected)
        .put(bytesForFixture(), { contentType: 'text/plain' });
    });
    await expect(
      deletion.permanentlyDelete(services, 'main', marker, new AbortController().signal, () => {}),
    ).rejects.toThrow(/Unexpected object/);
    expect((await captureRepository.loadItem(services.db, 'main', trashed.id))?.recordState).toBe(
      'deleting',
    );
    const preview = await inspectOrphans(services, 'main', new AbortController().signal, () => {});
    expect(preview.findings).toContainEqual({
      path: unexpected,
      kind: 'unexpected',
      byteSize: null,
      createdAt: null,
    });
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.storage('gs://demo-inventory.firebasestorage.app').ref(unexpected).delete();
    });
    await deletion.permanentlyDelete(
      services,
      'main',
      marker,
      new AbortController().signal,
      () => {},
    );
    expect(await captureRepository.loadItem(services.db, 'main', marker.id)).toBeNull();
  });
  function bytesForFixture() {
    return new Uint8Array([255, 216, 255, 217]);
  }
  it('lists more than 100 photo folders, preserves recent orphans in previews, detects changed metadata, and cleans only a confirmed item', async () => {
    const services = await owner('cleanup-pagination');
    const signal = new AbortController().signal;
    const saved = await ensureDraft(services.db, 'main', 'cleanup-pagination', {
      name: 'Synthetic paginated cleanup',
      roomId: null,
      photos: [],
      reviewStatus: 'needs_review',
    });
    const paths = Array.from({ length: 105 }, (_, index) =>
      photoPath('main', saved.id, `photo-${index}`, 'detail'),
    );
    await environment.withSecurityRulesDisabled(async (context) => {
      await runBounded(paths, 8, async (path) => {
        await context
          .storage('gs://demo-inventory.firebasestorage.app')
          .ref(path)
          .put(bytesForFixture(), { contentType: 'image/jpeg' });
      });
    });
    const listed: string[] = [];
    for await (const object of photoObjects(services.storage, 'main', signal, saved.id))
      listed.push(object.fullPath);
    expect(new Set(listed)).toEqual(new Set(paths));
    const preview = await inspectOrphans(services, 'main', signal, () => {});
    expect(preview.recent).toBeGreaterThanOrEqual(105);
    expect(preview.referenced).toBeGreaterThanOrEqual(2);
    expect(preview.findings.some((entry) => paths.includes(entry.path))).toBe(false);
    const originalLoad = captureRepository.loadItems;
    const spy = vi.spyOn(captureRepository, 'loadItems').mockImplementationOnce(async (...args) => {
      const snapshot = await originalLoad(...args);
      await organizeRepository.editItem(services.db, 'main', saved, {
        kind: 'metadata',
        patch: { notes: 'Synthetic changed during preview' },
      });
      return snapshot;
    });
    try {
      await expect(inspectOrphans(services, 'main', signal, () => {})).rejects.toThrow(
        /Inventory changed during inspection/,
      );
    } finally {
      spy.mockRestore();
    }
    const current = (await captureRepository.loadItem(services.db, 'main', saved.id))!;
    const trashed = await organizeRepository.editItem(services.db, 'main', current, {
      kind: 'trash',
    });
    await deletion.permanentlyDelete(services, 'main', trashed, signal, () => {});
    expect(await captureRepository.loadItem(services.db, 'main', saved.id)).toBeNull();
    const remaining: string[] = [];
    for await (const object of photoObjects(services.storage, 'main', signal, saved.id))
      remaining.push(object.fullPath);
    expect(remaining).toEqual([]);
  }, 30000);
  it('exports current SDK records and authenticated bytes with archive/trash history and rejects missing bytes or foreign access', async () => {
    const services = await owner('export-sdk');
    const inventory = 'export-sdk';
    const signal = new AbortController().signal;
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`inventories/${inventory}`).set({
        schemaVersion: 2,
        ownerUid: LOCAL_ACCOUNTS.owner.uid,
        displayName: 'Synthetic export inventory',
        defaultCurrency: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
    const room = await createRoom(services.db, inventory, 'Synthetic export room', 0);
    const oldRoom = await createRoom(services.db, inventory, 'Synthetic archived room', 1);
    const box = await organizeRepository.createBox(
      services.db,
      inventory,
      'Synthetic mixed box',
      0,
    );
    const plan = await attempt('export-photo');
    const photo = {
      ...plan.input.photos[0]!,
      detail: {
        ...plan.input.photos[0]!.detail,
        storagePath: photoPath(inventory, plan.id, 'photo-one', 'detail'),
      },
      thumbnail: {
        ...plan.input.photos[0]!.thumbnail,
        storagePath: photoPath(inventory, plan.id, 'photo-one', 'thumb'),
      },
    };
    await saveAttempt(
      services,
      inventory,
      {
        ...plan,
        input: { ...plan.input, roomId: room.id, photos: [photo] },
        prepared: [{ ...plan.prepared[0]!, photo }],
      },
      signal,
      () => {},
    );
    const grouped = await ensureDraft(services.db, inventory, 'export-grouped', {
      name: '=Synthetic grouped item',
      roomId: room.id,
      photos: [],
      reviewStatus: 'reviewed',
    });
    const valued = await organizeRepository.editItem(services.db, inventory, grouped, {
      kind: 'metadata',
      patch: {
        quantity: 7,
        serialNumber: '00042',
        notes: 'Synthetic multiline\næ',
        estimatedValue: { amountMinor: 0, currency: 'JPY' },
      },
    });
    await organizeRepository.editItem(services.db, inventory, valued, {
      kind: 'pack',
      boxId: box.id,
    });
    const sold = await ensureDraft(services.db, inventory, 'export-sold', {
      name: 'Synthetic sold item',
      roomId: oldRoom.id,
      photos: [],
      reviewStatus: 'needs_review',
    });
    const decision = await organizeRepository.editItem(services.db, inventory, sold, {
      kind: 'decision',
      decision: 'sell',
    });
    await organizeRepository.editItem(services.db, inventory, decision, {
      kind: 'progress',
      progress: 'completed',
    });
    await organizeRepository.archiveLocation(services.db, inventory, 'room', oldRoom.id);
    const trash = await ensureDraft(services.db, inventory, 'export-trash', {
      name: 'Synthetic trash',
      roomId: room.id,
      photos: [],
      reviewStatus: 'needs_review',
    });
    await organizeRepository.editItem(services.db, inventory, trash, { kind: 'trash' });
    const iterator = createExport(services, inventory, signal, () => {});
    const part = (await iterator.next()).value!;
    expect(part.final).toBe(true);
    const payload = unzipSync(new Uint8Array(await part.blob.arrayBuffer()));
    const manifest = JSON.parse(new TextDecoder().decode(payload['manifest.json']));
    expect(manifest.counts).toEqual({ items: 4, rooms: 2, boxes: 1, photos: 1, photoFiles: 2 });
    const records = JSON.parse(new TextDecoder().decode(payload['items.json'])) as {
      id: string;
      roomId: string | null;
      boxId: string | null;
      quantity: number;
      deletedAt: unknown;
      completedAt: unknown;
    }[];
    expect(records.find((item) => item.id === grouped.id)).toMatchObject({
      quantity: 7,
      roomId: room.id,
      boxId: box.id,
    });
    expect(records.find((item) => item.id === sold.id)?.completedAt).not.toBeNull();
    expect(records.find((item) => item.id === trash.id)?.deletedAt).not.toBeNull();
    expect(payload['photos/export-photo/photo-one/detail.jpg']).toEqual(bytesForFixture());
    await iterator.return(undefined);
    const foreign = await owner('export-foreign');
    await signInWithEmailAndPassword(
      foreign.auth,
      LOCAL_ACCOUNTS.unrelated.email,
      LOCAL_ACCOUNTS.unrelated.password,
    );
    await expect(createExport(foreign, inventory, signal, () => {}).next()).rejects.toThrow();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .storage('gs://demo-inventory.firebasestorage.app')
        .ref(photo.detail.storagePath)
        .delete();
    });
    await expect(createExport(services, inventory, signal, () => {}).next()).rejects.toThrow();
  });
  it('does not overwrite an existing different owner binding', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc('inventories/main')
        .set({ schemaVersion: 2, ownerUid: 'different-synthetic-owner' });
    });
    await expect(seedLocal(validateConfig(env))).rejects.toThrow();
  });
});
