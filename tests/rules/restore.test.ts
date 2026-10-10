import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  getDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { captureDraft, photoPath } from '../../src/domain/item';
import { assertLocalTarget } from '../../scripts/safety';

let environment: RulesTestEnvironment;
const inventory = 'restore-rules';
const uid = 'synthetic-restore-owner';
beforeAll(async () => {
  assertLocalTarget('demo-inventory', process.env);
  environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080, rules: await readFile('firestore.rules', 'utf8') },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`inventories/${inventory}`).set({
      schemaVersion: 2,
      ownerUid: uid,
      displayName: 'Synthetic restore policy',
      defaultCurrency: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
});
afterAll(async () => environment?.cleanup());
const client = (identity: string | null = uid) =>
  (identity
    ? environment.authenticatedContext(identity)
    : environment.unauthenticatedContext()
  ).firestore() as unknown as Firestore;
const active = (db: Firestore) => doc(db, `inventories/${inventory}/restores/active`);
const old = Timestamp.fromMillis(1000);
async function reset() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(`inventories/${inventory}/restores/active`).delete();
  });
}
function marker() {
  return {
    schemaVersion: 2,
    revision: 1,
    operationId: crypto.randomUUID(),
    exportId: 'synthetic-export',
    manifestSha256: 'a'.repeat(64),
    state: 'restoring',
    counts: { items: 1, rooms: 0, boxes: 0, photos: 0, photoFiles: 0 },
    claimedRecords: 0,
    completedRecords: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}
it('permits narrow owner restore claims/history, freezes ordinary edits, and finalizes before reopening mutations', async () => {
  await reset();
  const db = client();
  const id = crypto.randomUUID();
  const operation = marker();
  const item = doc(db, `inventories/${inventory}/items/${id}`);
  const report = doc(db, `inventories/${inventory}/restores/active/records/item_${id}`);
  const record = {
    ...captureDraft(
      { name: 'Synthetic historical restore', roomId: null, photos: [], reviewStatus: 'reviewed' },
      old,
    ),
    quantity: 7,
    decision: 'take',
    progress: 'completed',
    completedAt: old,
    updatedAt: serverTimestamp(),
  };
  await assertFails(setDoc(item, record));
  await assertSucceeds(setDoc(active(db), operation));
  await assertFails(setDoc(item, record));
  const batch = writeBatch(db);
  batch.update(active(db), { claimedRecords: 1, revision: 2, updatedAt: serverTimestamp() });
  batch.set(report, {
    schemaVersion: 2,
    revision: 1,
    operationId: operation.operationId,
    kind: 'item',
    recordId: id,
    recordSha256: 'b'.repeat(64),
    state: 'pending',
    coverPhotoId: null,
    deletedAt: old,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(item, record);
  await assertSucceeds(batch.commit());
  await assertFails(
    updateDoc(item, {
      notes: 'Forbidden ordinary edit during restore',
      revision: 2,
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(
    updateDoc(doc(db, `inventories/${inventory}`), {
      displayName: 'Forbidden settings during restore',
      updatedAt: serverTimestamp(),
    }),
  );
  const finalize = writeBatch(db);
  finalize.update(item, { deletedAt: old, revision: 2, updatedAt: serverTimestamp() });
  finalize.update(report, { state: 'verified', revision: 2, updatedAt: serverTimestamp() });
  finalize.update(active(db), { completedRecords: 1, revision: 3, updatedAt: serverTimestamp() });
  await assertSucceeds(finalize.commit());
  await assertSucceeds(
    updateDoc(active(db), { state: 'completed', revision: 4, updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(item, { deletedAt: null, revision: 3, updatedAt: serverTimestamp() }),
  );
  expect((await getDoc(item)).data()?.quantity).toBe(7);
});
it.each([null, 'synthetic-foreign-owner'])(
  'denies restore authority, claims, and reports for %s',
  async (identity) => {
    const db = client(identity);
    await assertFails(getDoc(active(db)));
    await assertFails(setDoc(active(db), marker()));
    await assertFails(
      setDoc(doc(db, `inventories/${inventory}/restores/active/records/item_foreign`), {
        schemaVersion: 2,
        revision: 1,
        operationId: 'synthetic-op',
        kind: 'item',
        recordId: 'foreign',
        recordSha256: 'b'.repeat(64),
        state: 'pending',
        coverPhotoId: null,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  },
);
it('rejects claiming an existing record and invalid counters/completion', async () => {
  await reset();
  const db = client();
  const id = crypto.randomUUID();
  const operation = marker();
  const record = doc(db, `inventories/${inventory}/items/${id}`);
  await setDoc(record, {
    ...captureDraft(
      { name: 'Synthetic existing', roomId: null, photos: [], reviewStatus: 'needs_review' },
      old,
    ),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(active(db), operation);
  await assertFails(
    updateDoc(active(db), { state: 'completed', revision: 2, updatedAt: serverTimestamp() }),
  );
  await assertFails(
    updateDoc(active(db), { claimedRecords: -1, revision: 2, updatedAt: serverTimestamp() }),
  );
  const claim = writeBatch(db);
  claim.set(doc(db, `inventories/${inventory}/restores/active/records/item_${id}`), {
    schemaVersion: 2,
    revision: 1,
    operationId: operation.operationId,
    kind: 'item',
    recordId: id,
    recordSha256: 'b'.repeat(64),
    state: 'pending',
    coverPhotoId: null,
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  claim.update(active(db), { claimedRecords: 1, revision: 2, updatedAt: serverTimestamp() });
  await assertFails(claim.commit());
});
it('registers two fully validated photos under an import claim without weakening the photo limit', async () => {
  await reset();
  const db = client();
  const id = crypto.randomUUID();
  const operation = {
    ...marker(),
    counts: { items: 1, rooms: 0, boxes: 0, photos: 2, photoFiles: 4 },
  };
  await setDoc(active(db), operation);
  const target = doc(db, `inventories/${inventory}/items/${id}`);
  const report = doc(db, `inventories/${inventory}/restores/active/records/item_${id}`);
  const claim = writeBatch(db);
  claim.update(active(db), { claimedRecords: 1, revision: 2, updatedAt: serverTimestamp() });
  claim.set(report, {
    schemaVersion: 2,
    revision: 1,
    operationId: operation.operationId,
    kind: 'item',
    recordId: id,
    recordSha256: 'b'.repeat(64),
    state: 'pending',
    coverPhotoId: 'photo-0',
    deletedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  claim.set(target, {
    ...captureDraft(
      { name: 'Synthetic two-photo import', roomId: null, photos: [], reviewStatus: 'reviewed' },
      old,
    ),
    quantity: 7,
    updatedAt: serverTimestamp(),
  });
  await claim.commit();
  const photos = Array.from({ length: 2 }, (_, index) => {
    const photo = `photo-${index}`;
    const file = (variant: 'detail' | 'thumb') => ({
      storagePath: photoPath(inventory, id, photo, variant),
      contentType: 'image/jpeg',
      byteSize: 4,
      width: 2,
      height: 2,
      sha256: 'c'.repeat(64),
    });
    return { id: photo, state: 'pending', detail: file('detail'), thumbnail: file('thumb') };
  });
  await assertSucceeds(updateDoc(target, { photos, revision: 2, updatedAt: serverTimestamp() }));
  const finish = writeBatch(db);
  finish.update(target, { deletedAt: null, revision: 3, updatedAt: serverTimestamp() });
  finish.update(report, { state: 'verified', revision: 2, updatedAt: serverTimestamp() });
  finish.update(active(db), { completedRecords: 1, revision: 3, updatedAt: serverTimestamp() });
  await assertFails(finish.commit());
  await assertSucceeds(
    updateDoc(target, {
      photos: photos.map((photo) => ({ ...photo, state: 'ready' })),
      coverPhotoId: photos[0]!.id,
      revision: 3,
      updatedAt: serverTimestamp(),
    }),
  );
});
