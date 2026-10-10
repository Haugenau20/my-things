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
import { Timestamp, serverTimestamp } from 'firebase/firestore';
import { captureDraft, photoPath } from '../../src/domain/item';
import { doc, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

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

describe('M2 constrained owner organization', () => {
  const db = (uid: string | null = 'synthetic-owner') =>
    (uid
      ? environment.authenticatedContext(uid)
      : environment.unauthenticatedContext()
    ).firestore() as unknown as Firestore;
  async function record() {
    const id = crypto.randomUUID();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc(`inventories/main/items/${id}`)
        .set(
          captureDraft(
            { name: 'Synthetic M2', roomId: null, photos: [], reviewStatus: 'needs_review' },
            Timestamp.now(),
          ),
        );
    });
    return id;
  }
  const patch = (data: object) => ({ ...data, revision: 2, updatedAt: serverTimestamp() });
  it('allows partial metadata patches and explicit review without changing photo fields', async () => {
    const id = await record();
    await assertSucceeds(
      updateDoc(
        doc(db(), 'inventories/main/items', id),
        patch({
          quantity: 7,
          estimatedValue: { amountMinor: 0, currency: 'JPY' },
          serialNumber: '0007',
          notes: 'Plain text',
          category: 'Kitchen',
          reviewStatus: 'reviewed',
        }),
      ),
    );
  });
  it.each([null, 'unrelated-user'])('denies valid-looking metadata edits from %s', async (uid) => {
    const id = await record();
    await assertFails(
      updateDoc(doc(db(uid), 'inventories/main/items', id), patch({ quantity: 7 })),
    );
  });
  it.each([
    { quantity: 0 },
    { quantity: 1.2 },
    { name: '' },
    { notes: 'x'.repeat(10001) },
    { estimatedValue: { amountMinor: -1, currency: 'EUR' } },
    { estimatedValue: { amountMinor: 1, currency: 'BAD' } },
    { estimatedValue: { amountMinor: 1.1, currency: 'EUR' } },
    { extra: true },
    { schemaVersion: 2 },
    { createdAt: Timestamp.now() },
    { photos: [{ id: 'fake' }] },
    { coverPhotoId: 'fake' },
    { progress: 'completed', completedAt: serverTimestamp() },
    { currentLocation: { kind: 'box', boxId: 'missing' } },
    { originalRoomId: 'missing' },
    { recordState: 'deleting' },
    { revision: 10 },
  ])('denies malformed organization patches %#', async (data) => {
    const id = await record();
    await assertFails(
      updateDoc(doc(db(), 'inventories/main/items', id), { ...patch({}), ...data }),
    );
  });
  it('requires workflow reset on decision change and unassigned disposal completion', async () => {
    const id = await record();
    const reference = doc(db(), 'inventories/main/items', id);
    await assertSucceeds(updateDoc(reference, patch({ decision: 'sell' })));
    await assertSucceeds(
      updateDoc(reference, {
        progress: 'completed',
        completedAt: serverTimestamp(),
        revision: 3,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      updateDoc(reference, { decision: 'take', revision: 4, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(reference, {
        decision: 'take',
        progress: 'not_started',
        completedAt: null,
        revision: 4,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it('requires an active destination revision in the same move transaction', async () => {
    const id = await record();
    const roomId = crypto.randomUUID();
    await environment.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`inventories/main/rooms/${roomId}`).set({
        schemaVersion: 1,
        revision: 1,
        name: 'Synthetic destination',
        sortOrder: 0,
        archivedAt: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });
    const client = db();
    const item = doc(client, 'inventories/main/items', id);
    const room = doc(client, 'inventories/main/rooms', roomId);
    const movement = patch({ currentLocation: { kind: 'room', roomId }, originalRoomId: roomId });
    await assertFails(updateDoc(item, movement));
    const batch = writeBatch(client);
    batch.update(item, movement);
    batch.update(room, { revision: 2, updatedAt: serverTimestamp() });
    await assertSucceeds(batch.commit());
    await assertFails(
      updateDoc(item, {
        currentLocation: { kind: 'unassigned' },
        originalRoomId: 'missing',
        revision: 3,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it('allows valid boxes but denies foreign creation, unknown fields, deletion, and invalid updates', async () => {
    const id = crypto.randomUUID();
    const value = {
      schemaVersion: 1,
      revision: 1,
      label: 'B012',
      notes: '',
      sortOrder: 0,
      archivedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(db(), 'inventories/main/boxes', id), value));
    await assertFails(
      setDoc(doc(db('unrelated-user'), 'inventories/main/boxes/foreign-box'), value),
    );
    await assertFails(
      setDoc(doc(db(), 'inventories/main/boxes/invalid-box'), { ...value, unexpected: true }),
    );
    await assertSucceeds(
      updateDoc(
        doc(db(), 'inventories/main/boxes', id),
        patch({ label: 'Renamed', notes: 'Shelf contents' }),
      ),
    );
    await assertFails(
      updateDoc(doc(db(), 'inventories/main/boxes', id), {
        label: '',
        revision: 3,
        updatedAt: serverTimestamp(),
      }),
    );
  });
});

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
    for (const id of ['test-upload', 'test-invalid', 'test-token']) {
      await db.doc(`inventories/main/items/${id}`).set({
        recordState: 'draft',
        photos: [
          {
            id: 'synthetic-photo',
            state: 'pending',
            detail: { byteSize: 4 },
            thumbnail: { byteSize: 4 },
          },
        ],
      });
    }
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
  it('denies malformed child records and unimplemented edits', async () => {
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

describe('M1 capture authorization', () => {
  const owner = () => environment.authenticatedContext('synthetic-owner').firestore();
  const draft = (id: string, count = 1) => ({
    ...captureDraft(
      {
        name: 'Synthetic lamp',
        roomId: null,
        reviewStatus: 'needs_review',
        photos: Array.from({ length: count }, (_, index) => {
          const photoId = `photo-${index}`;
          const file = (variant: 'detail' | 'thumb') => ({
            storagePath: photoPath('main', id, photoId, variant),
            contentType: 'image/jpeg' as const,
            byteSize: 4,
            width: 10,
            height: 8,
            sha256: 'a'.repeat(64),
          });
          return {
            id: photoId,
            state: 'pending' as const,
            detail: file('detail'),
            thumbnail: file('thumb'),
          };
        }),
      },
      Timestamp.now(),
    ),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  it.each([1, 2])('allows owner draft and exact completion with %i photos', async (count) => {
    const id = `valid-capture-${count}`;
    const data = draft(id, count);
    const record = owner().doc(`inventories/main/items/${id}`);
    await assertSucceeds(record.set(data));
    await assertFails(record.delete());
    await assertSucceeds(
      record.update({
        revision: 2,
        updatedAt: serverTimestamp(),
        recordState: 'ready',
        coverPhotoId: data.photos[0]!.id,
        photos: data.photos.map((photo) => ({ ...photo, state: 'ready' })),
      }),
    );
    await assertFails(record.delete());
    await assertSucceeds(
      record.update({ name: 'M2 edit', revision: 3, updatedAt: serverTimestamp() }),
    );
  });
  it('allows an acknowledged photo-free owner capture but no draft with zero photos', async () => {
    const data = { ...draft('photo-free'), recordState: 'ready', photos: [] };
    await assertSucceeds(owner().doc('inventories/main/items/photo-free').set(data));
    await assertFails(
      owner()
        .doc('inventories/main/items/empty-draft')
        .set({ ...data, recordState: 'draft' }),
    );
    await assertFails(owner().doc('inventories/main/items/photo-free').delete());
    for (const uid of [null, 'unrelated-user']) {
      const context =
        uid === null ? environment.unauthenticatedContext() : environment.authenticatedContext(uid);
      await assertFails(
        context.firestore().doc('inventories/main/items/foreign-photo-free').set(data),
      );
    }
  });
  it.each([1, 2])(
    'allows only revision-checked first-photo attachment and exact completion with %i photos',
    async (count) => {
      const id = `attachment-${count}`;
      const data = draft(id, count);
      const record = owner().doc(`inventories/main/items/${id}`);
      await assertSucceeds(record.set({ ...data, recordState: 'ready', photos: [] }));
      const registration = { photos: data.photos, revision: 2, updatedAt: serverTimestamp() };
      await assertFails(record.update({ ...registration, name: 'Unexpected edit' }));
      await assertFails(record.update({ ...registration, revision: 1 }));
      await assertFails(
        record.update({
          ...registration,
          photos: data.photos.map((photo) => ({ ...photo, state: 'ready' })),
          coverPhotoId: data.photos[0]!.id,
        }),
      );
      await assertSucceeds(record.update(registration));
      const completion = {
        photos: data.photos.map((photo) => ({ ...photo, state: 'ready' })),
        coverPhotoId: data.photos[0]!.id,
        revision: 3,
        updatedAt: serverTimestamp(),
      };
      await assertFails(
        record.update({
          ...completion,
          photos: completion.photos.map((photo) => ({
            ...photo,
            detail: { ...photo.detail, sha256: 'b'.repeat(64) },
          })),
        }),
      );
      await assertSucceeds(record.update(completion));
      await assertFails(
        record.update({
          photos: [],
          coverPhotoId: null,
          revision: 4,
          updatedAt: serverTimestamp(),
        }),
      );
    },
  );
  it('allows attachment cleanup markers without deleting the original saved item', async () => {
    const id = 'attachment-discard';
    const data = draft(id, 2);
    const record = owner().doc(`inventories/main/items/${id}`);
    await assertSucceeds(record.set({ ...data, recordState: 'ready', photos: [] }));
    await assertSucceeds(
      record.update({ photos: data.photos, revision: 2, updatedAt: serverTimestamp() }),
    );
    await assertFails(record.update({ photos: [], revision: 3, updatedAt: serverTimestamp() }));
    const deleting = data.photos.map((photo) => ({ ...photo, state: 'deleting' }));
    await assertSucceeds(
      record.update({ photos: deleting, revision: 3, updatedAt: serverTimestamp() }),
    );
    await assertFails(record.delete());
    await assertSucceeds(record.update({ photos: [], revision: 4, updatedAt: serverTimestamp() }));
    await assertFails(record.delete());
  });
  it('rejects foreign, malformed, partial, and excess first-photo updates', async () => {
    const id = 'attachment-negative';
    const data = draft(id, 2);
    const record = owner().doc(`inventories/main/items/${id}`);
    await assertSucceeds(record.set({ ...data, recordState: 'ready', photos: [] }));
    const registration = { photos: data.photos, revision: 2, updatedAt: serverTimestamp() };
    for (const uid of [null, 'unrelated-user']) {
      const context =
        uid === null ? environment.unauthenticatedContext() : environment.authenticatedContext(uid);
      await assertFails(
        context.firestore().doc(`inventories/main/items/${id}`).update(registration),
      );
    }
    await assertFails(record.update({ ...registration, photos: [...data.photos, data.photos[0]] }));
    await assertFails(
      record.update({
        ...registration,
        photos: [
          data.photos[0],
          { ...data.photos[1], thumbnail: { ...data.photos[1]!.thumbnail, sha256: 'invalid' } },
        ],
      }),
    );
    await assertSucceeds(record.update(registration));
    await assertFails(
      record.update({
        photos: [{ ...data.photos[0], state: 'ready' }, data.photos[1]],
        coverPhotoId: data.photos[0]!.id,
        revision: 3,
        updatedAt: serverTimestamp(),
      }),
    );
  });
  it.each([null, 'unrelated-user'])('denies a valid capture for %s', async (uid) => {
    const context =
      uid === null ? environment.unauthenticatedContext() : environment.authenticatedContext(uid);
    await assertFails(
      context
        .firestore()
        .doc('inventories/main/items/foreign-capture')
        .set(draft('foreign-capture')),
    );
  });
  it.each([
    'name',
    'quantity',
    'schema',
    'extra',
    'path',
    'hash',
    'dimensions',
    'duplicates',
    'ready',
    'empty',
    'location',
  ])('rejects invalid capture %s', async (kind) => {
    const id = `invalid-${kind}`;
    const data = draft(id);
    const first = data.photos[0]!;
    const patches: Record<string, object> = {
      name: { name: '   ' },
      quantity: { quantity: 0 },
      schema: { schemaVersion: 2 },
      extra: { unexpected: true },
      path: {
        photos: [
          {
            ...first,
            detail: {
              ...first.detail,
              storagePath: 'inventories/foreign/items/id/photos/id/detail.jpg',
            },
          },
        ],
      },
      hash: { photos: [{ ...first, detail: { ...first.detail, sha256: 'x' } }] },
      dimensions: { photos: [{ ...first, thumbnail: { ...first.thumbnail, width: 401 } }] },
      duplicates: { photos: [first, first] },
      ready: { recordState: 'ready', coverPhotoId: first.id },
      empty: { photos: [] },
      location: { currentLocation: { kind: 'unassigned', roomId: 'missing' } },
    };
    await assertFails(
      owner()
        .doc(`inventories/main/items/${id}`)
        .set({ ...data, ...patches[kind] }),
    );
  });
  it('denies stale revision, changed bytes, and partial-photo finalization', async () => {
    const id = 'contested-capture';
    const data = draft(id, 2);
    const record = owner().doc(`inventories/main/items/${id}`);
    await assertSucceeds(record.set(data));
    const final = {
      revision: 2,
      updatedAt: serverTimestamp(),
      recordState: 'ready',
      coverPhotoId: data.photos[0]!.id,
      photos: data.photos.map((photo) => ({ ...photo, state: 'ready' })),
    };
    await assertFails(record.update({ ...final, revision: 1 }));
    await assertFails(record.update({ ...final, photos: [final.photos[0], data.photos[1]] }));
    await assertFails(
      record.update({
        ...final,
        photos: final.photos.map((photo) => ({
          ...photo,
          detail: { ...photo.detail, sha256: 'b'.repeat(64) },
        })),
      }),
    );
  });
  it('rejects a third photo and invalid metadata in the second photo', async () => {
    const data = draft('photo-limit', 2);
    const first = data.photos[0]!;
    const second = data.photos[1]!;
    await assertFails(
      owner()
        .doc('inventories/main/items/photo-limit')
        .set({ ...data, photos: [...data.photos, { ...first, id: 'photo-2' }] }),
    );
    await assertFails(
      owner()
        .doc('inventories/main/items/photo-limit')
        .set({
          ...data,
          photos: [first, { ...second, thumbnail: { ...second.thumbnail, sha256: 'invalid' } }],
        }),
    );
  });
  it('allows explicit draft discard only after the durable deleting marker', async () => {
    const id = 'discard-capture';
    const record = owner().doc(`inventories/main/items/${id}`);
    await assertSucceeds(record.set(draft(id)));
    await assertFails(record.delete());
    await assertSucceeds(
      record.update({ recordState: 'deleting', revision: 2, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(record.delete());
  });
  it('allows minimal room creation and rejects missing/archived room capture', async () => {
    const room = {
      schemaVersion: 1,
      name: 'Synthetic room',
      sortOrder: 0,
      revision: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      archivedAt: null,
    };
    await assertSucceeds(owner().doc('inventories/main/rooms/capture-room').set(room));
    const capture = (id: string, roomId: string) => ({
      ...draft(id),
      originalRoomId: roomId,
      currentLocation: { kind: 'room', roomId },
    });
    const client = owner();
    await assertFails(
      client
        .doc('inventories/main/items/room-without-revision')
        .set(capture('room-without-revision', 'capture-room')),
    );
    const batch = client.batch();
    batch.set(
      client.doc('inventories/main/items/room-capture'),
      capture('room-capture', 'capture-room'),
    );
    batch.update(client.doc('inventories/main/rooms/capture-room'), {
      revision: 2,
      updatedAt: serverTimestamp(),
    });
    await assertSucceeds(batch.commit());
    await assertFails(
      owner()
        .doc('inventories/main/items/missing-room')
        .set(capture('missing-room', 'absent-room')),
    );
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc('inventories/main/rooms/archived-room')
        .set({ ...room, createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp });
    });
    await assertFails(
      owner()
        .doc('inventories/main/items/archived-room')
        .set(capture('archived-room', 'archived-room')),
    );
    await assertFails(
      owner().doc('inventories/main/rooms/capture-room').update({ name: 'M2 rename' }),
    );
    await assertFails(owner().doc('inventories/main/rooms/capture-room').delete());
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
  it('denies metadata updates and changed photo bytes at existing paths', async () => {
    const reference = owner().storage('gs://demo-inventory.firebasestorage.app').ref(photo);
    await assertFails(reference.updateMetadata({ cacheControl: 'private, no-store, max-age=0' }));
    await assertFails(
      uploadBytes(ref(storage(owner()), photo), new Uint8Array([1, 2, 3, 4]), {
        contentType: 'image/jpeg',
        cacheControl: 'private, no-store, max-age=0',
      }),
    );
  });
  it('denies uploads without a pending capture and after discard begins', async () => {
    const path = 'inventories/main/items/discarding/photos/synthetic-photo/detail.jpg';
    await assertFails(
      uploadBytes(ref(storage(owner()), path), bytes, { contentType: 'image/jpeg' }),
    );
    await environment.withSecurityRulesDisabled(async (context) => {
      await context
        .firestore()
        .doc('inventories/main/items/discarding')
        .set({
          recordState: 'deleting',
          photos: [
            {
              id: 'synthetic-photo',
              state: 'pending',
              detail: { byteSize: 4 },
              thumbnail: { byteSize: 4 },
            },
          ],
        });
    });
    await assertFails(
      uploadBytes(ref(storage(owner()), path), bytes, { contentType: 'image/jpeg' }),
    );
  });
});
