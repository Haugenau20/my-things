import type { AppConfig } from '../src/data/config.ts';
import { DEMO_PROJECT_ID } from '../src/data/config.ts';
import { LOCAL_ACCOUNTS } from '../src/data/local-accounts.ts';
import { assertLocalTarget } from './safety.ts';
import { assertEmulatorsRunning } from './health.ts';
import { z } from 'zod';

export async function seedLocal(config: AppConfig): Promise<void> {
  if (
    config.environment !== 'local' ||
    config.firebase.projectId !== DEMO_PROJECT_ID ||
    config.inventoryId !== 'main' ||
    !config.emulators
  ) {
    throw new Error('Synthetic seed requires the local demo-inventory/main target');
  }
  const endpoints = config.emulators;
  assertLocalTarget(config.firebase.projectId, {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: `${endpoints.host}:${endpoints.auth}`,
    FIRESTORE_EMULATOR_HOST: `${endpoints.host}:${endpoints.firestore}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `${endpoints.host}:${endpoints.storage}`,
  });
  await assertEmulatorsRunning(config);
  // Privileged test tooling is imported only after the complete demo-only gate.
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const environment = await initializeTestEnvironment({
    projectId: DEMO_PROJECT_ID,
    firestore: { host: endpoints.host, port: endpoints.firestore },
    storage: { host: endpoints.host, port: endpoints.storage },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.runTransaction(async (transaction) => {
        const reference = db.doc('inventories/main');
        const existing = await transaction.get(reference);
        if (existing.exists) {
          if (
            existing.data()?.ownerUid !== LOCAL_ACCOUNTS.owner.uid ||
            existing.data()?.schemaVersion !== 1
          ) {
            throw new Error('Refusing to replace an existing different owner policy');
          }
          return;
        }
        const time = new Date('2026-10-10T00:00:00Z');
        transaction.set(reference, {
          schemaVersion: 1,
          ownerUid: LOCAL_ACCOUNTS.owner.uid,
          displayName: 'Synthetic inventory',
          defaultCurrency: null,
          createdAt: time,
          updatedAt: time,
        });
      });
    });
    const url = `http://${endpoints.host}:${endpoints.auth}/identitytoolkit.googleapis.com/v1/projects/${DEMO_PROJECT_ID}`;
    async function request(path: string, body: unknown): Promise<unknown> {
      const response = await fetch(url + path, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Synthetic Auth seed request failed (${response.status})`);
      return response.json();
    }
    const lookup = z.object({
      users: z.array(z.object({ localId: z.string(), email: z.string() })).optional(),
    });
    for (const account of Object.values(LOCAL_ACCOUNTS)) {
      const existing = lookup.parse(await request('/accounts:lookup', { localId: [account.uid] }))
        .users?.[0];
      if (existing) {
        if (existing.localId !== account.uid || existing.email !== account.email) {
          throw new Error('Synthetic identity collision; no account was overwritten');
        }
      } else {
        const created = z.object({ localId: z.string() }).parse(
          await request('/accounts', {
            localId: account.uid,
            email: account.email,
            password: account.password,
            displayName: account.uid,
            emailVerified: true,
          }),
        );
        if (created.localId !== account.uid) throw new Error('Unexpected synthetic identity');
      }
    }
  } finally {
    await environment.cleanup();
  }
}
