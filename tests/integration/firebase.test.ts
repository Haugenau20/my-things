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
