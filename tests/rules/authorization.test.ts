import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestContext, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { assertLocalTarget } from '../../scripts/safety';

let environment: RulesTestEnvironment;
const photo = 'inventories/main/items/synthetic-item/photos/synthetic-photo/detail.jpg';
const timestamp = new Date('2026-10-10T00:00:00Z');
const root = {
  schemaVersion: 1,
  ownerUid: 'synthetic-owner',
  displayName: 'Synthetic inventory',
  defaultCurrency: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const bytes = new Uint8Array([255, 216, 255, 217]);

// The test library returns compat handles; modular SDK functions unwrap them internally.
function storage(context: RulesTestContext): FirebaseStorage {
  return context.storage('gs://demo-inventory.firebasestorage.app') as unknown as FirebaseStorage;
}

beforeAll(async () => {
  assertLocalTarget('demo-inventory', process.env);
  environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') },
    storage: { host: '127.0.0.1', port: 19199, rules: await readFile('storage.rules', 'utf8') },
  });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('inventories/main').set(root);
    await db.doc('inventories/foreign').set({ ...root, ownerUid: 'foreign-owner' });
    await db.doc('inventories/malformed').set({ displayName: 'No owner policy' });
    for (const collection of ['items', 'rooms', 'boxes']) {
      await db.doc(`inventories/main/${collection}/synthetic-record`).set({ schemaVersion: 1 });
    }
    await uploadBytes(ref(storage(context), photo), bytes, { contentType: 'image/jpeg' });
  });
});
afterAll(async () => {
  await environment?.cleanup();
});

describe('Firestore owner policy', () => {
  const context = (uid: string | null) =>
    uid === null ? environment.unauthenticatedContext() : environment.authenticatedContext(uid);
  it('allows the owner to read the inventory policy', async () => {
    const result = await assertSucceeds(
      context('synthetic-owner').firestore().doc('inventories/main').get(),
    );
    expect(result.data()?.ownerUid).toBe('synthetic-owner');
  });
  it.each([null, 'unrelated-user'])('denies policy access for %s', async (uid) => {
    await assertFails(context(uid).firestore().doc('inventories/main').get());
  });
  it.each([null, 'unrelated-user', 'synthetic-owner'])(
    'denies root enumeration and claiming for %s',
    async (uid) => {
      const db = context(uid).firestore();
      await assertFails(db.collection('inventories').get());
      await assertFails(db.doc('inventories/claimed').set({ ...root, ownerUid: uid }));
      await assertFails(db.doc('inventories/main').delete());
    },
  );
  it.each(['items', 'rooms', 'boxes'])('allows owner reads and lists of %s', async (collection) => {
    const db = context('synthetic-owner').firestore();
    await assertSucceeds(db.doc(`inventories/main/${collection}/synthetic-record`).get());
    await assertSucceeds(db.collection(`inventories/main/${collection}`).get());
  });
  it.each(['items', 'rooms', 'boxes'])(
    'denies foreign reads/lists/writes of %s',
    async (collection) => {
      for (const uid of [null, 'unrelated-user']) {
        const db = context(uid).firestore();
        await assertFails(db.doc(`inventories/main/${collection}/synthetic-record`).get());
        await assertFails(db.collection(`inventories/main/${collection}`).get());
        await assertFails(db.doc(`inventories/main/${collection}/new`).set({ schemaVersion: 1 }));
        await assertFails(
          db.doc(`inventories/main/${collection}/synthetic-record`).update({ name: 'tampered' }),
        );
        await assertFails(db.doc(`inventories/main/${collection}/synthetic-record`).delete());
      }
    },
  );
  it('allows a validated owner settings update', async () => {
    const db = context('synthetic-owner').firestore();
    const { default: firebase } = await import('firebase/compat/app');
    await assertSucceeds(
      db.doc('inventories/main').update({
        displayName: 'Updated synthetic inventory',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }),
    );
  });
  it.each([
    { ownerUid: 'unrelated-user' },
    { schemaVersion: 2 },
    { unexpected: 'field' },
    { createdAt: new Date() },
    { displayName: '' },
    { defaultCurrency: 'invalid' },
    { updatedAt: new Date(0) },
  ])('denies unsafe root mutation', async (patch) => {
    await assertFails(context('synthetic-owner').firestore().doc('inventories/main').update(patch));
  });
  it.each(['missing', 'malformed', 'foreign'])(
    'denies inventory %s without matching valid policy',
    async (id) => {
      const db = context('synthetic-owner').firestore();
      await assertFails(db.doc(`inventories/${id}`).get());
      await assertFails(db.collection(`inventories/${id}/items`).get());
    },
  );
  it('denies unknown and nested paths even for the owner', async () => {
    const db = context('synthetic-owner').firestore();
    await assertFails(db.doc('inventories/main/members/synthetic-owner').get());
    await assertFails(db.doc('inventories/main/items/synthetic-record/hidden/data').get());
  });
  it('keeps all unimplemented child write operations closed in M0', async () => {
    const db = context('synthetic-owner').firestore();
    for (const collection of ['items', 'rooms', 'boxes']) {
      await assertFails(db.doc(`inventories/main/${collection}/new`).set({ schemaVersion: 1 }));
      await assertFails(
        db.doc(`inventories/main/${collection}/synthetic-record`).update({ revision: 2 }),
      );
      await assertFails(db.doc(`inventories/main/${collection}/synthetic-record`).delete());
    }
  });
});

describe('Storage owner policy', () => {
  const owner = () => environment.authenticatedContext('synthetic-owner');
  it('allows authenticated owner bytes and metadata retrieval', async () => {
    const reference = ref(storage(owner()), photo);
    const result = await assertSucceeds(getBytes(reference));
    expect(new Uint8Array(result)).toEqual(bytes);
    await assertSucceeds(
      owner().storage('gs://demo-inventory.firebasestorage.app').ref(photo).getMetadata(),
    );
  });
  it.each([null, 'unrelated-user'])(
    'denies bytes, metadata, listing, upload, and delete for %s',
    async (uid) => {
      const context =
        uid === null ? environment.unauthenticatedContext() : environment.authenticatedContext(uid);
      const store = context.storage('gs://demo-inventory.firebasestorage.app');
      await assertFails(getBytes(ref(storage(context), photo)));
      await assertFails(store.ref(photo).getMetadata());
      await assertFails(store.ref('inventories/main/items').listAll());
      await assertFails(
        uploadBytes(ref(storage(context), photo), bytes, { contentType: 'image/jpeg' }),
      );
      await assertFails(store.ref(photo).delete());
    },
  );
  it('allows listing only within the owned items namespace', async () => {
    const store = owner().storage('gs://demo-inventory.firebasestorage.app');
    await assertSucceeds(store.ref('inventories/main/items').listAll());
    await assertSucceeds(store.ref('inventories/main/items/synthetic-item/photos').listAll());
    await assertFails(store.ref('').listAll());
    await assertFails(store.ref('inventories').listAll());
    await assertFails(store.ref('inventories/foreign/items').listAll());
  });
  it.each(['missing', 'malformed', 'foreign'])(
    'denies photo access under %s inventory',
    async (id) => {
      const path = `inventories/${id}/items/synthetic-item/photos/synthetic-photo/detail.jpg`;
      await assertFails(
        uploadBytes(ref(storage(owner()), path), bytes, { contentType: 'image/jpeg' }),
      );
      await assertFails(getBytes(ref(storage(owner()), path)));
    },
  );
  it.each(['detail.jpg', 'thumb.jpg'])(
    'allows valid owner upload and independent deletion of %s',
    async (variant) => {
      const path = `inventories/main/items/test-upload/photos/synthetic-photo/${variant}`;
      await assertSucceeds(
        uploadBytes(ref(storage(owner()), path), bytes, { contentType: 'image/jpeg' }),
      );
      await assertSucceeds(
        owner().storage('gs://demo-inventory.firebasestorage.app').ref(path).delete(),
      );
    },
  );
  it.each([
    ['detail.jpg', 'text/html', 4],
    ['detail.jpg', 'image/svg+xml', 4],
    ['detail.jpg', 'image/jpeg', 8 * 1024 * 1024 + 1],
    ['thumb.jpg', 'image/jpeg', 512 * 1024 + 1],
    ['original.jpg', 'image/jpeg', 4],
    ['detail.png', 'image/jpeg', 4],
  ])('denies invalid variant/type/size %s %s %i', async (variant, contentType, size) => {
    const path = `inventories/main/items/test-invalid/photos/synthetic-photo/${variant}`;
    await assertFails(
      uploadBytes(ref(storage(owner()), path), new Uint8Array(size), { contentType }),
    );
  });
  it('denies unexpected and malformed namespaces', async () => {
    for (const path of [
      'public/detail.jpg',
      'inventories/main/other/detail.jpg',
      'inventories/main/items/bad.item/photos/synthetic-photo/detail.jpg',
    ]) {
      await assertFails(
        uploadBytes(ref(storage(owner()), path), bytes, { contentType: 'image/jpeg' }),
      );
    }
  });
  it('denies extra uploaded custom metadata and metadata-only changes', async () => {
    const reference = ref(
      storage(owner()),
      'inventories/main/items/test-token/photos/synthetic-photo/detail.jpg',
    );
    await assertFails(
      uploadBytes(reference, bytes, {
        contentType: 'image/jpeg',
        customMetadata: { unexpected: 'synthetic-extra-field' },
      }),
    );
    await assertFails(
      owner().storage('gs://demo-inventory.firebasestorage.app').ref(photo).updateMetadata({
        contentType: 'text/html',
      }),
    );
  });
});
