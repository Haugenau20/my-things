import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { ref, uploadBytes } from 'firebase/storage';
import { sha256 } from '../../src/media/processing';
import { ensureDraft, loadItems, createRoom } from '../../src/data/capture-repository';
import * as captureRepository from '../../src/data/capture-repository';
import { ensureFirstPhotos } from '../../src/data/photo-attachment-repository';
import * as captureMedia from '../../src/media/capture';
import { saveAttempt, recoverAttempt, discardAttempt } from '../../src/media/capture';
import type { CaptureAttempt } from '../../src/media/capture';

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
    expect(captureDraft(plan.input, Timestamp.now()).originalRoomId).toBe(room.id);
    const saved = await saveAttempt(services, 'main', plan, new AbortController().signal, () => {});
    expect(saved.currentLocation).toEqual({ kind: 'room', roomId: room.id });
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
  it('does not overwrite an existing different owner binding', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc('inventories/main')
        .set({ schemaVersion: 1, ownerUid: 'different-synthetic-owner' });
    });
    await expect(seedLocal(validateConfig(env))).rejects.toThrow();
  });
});
