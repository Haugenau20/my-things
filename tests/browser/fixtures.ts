import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { assertLocalTarget } from '../../scripts/safety';
import { LOCAL_ACCOUNTS } from '../../src/data/local-accounts';
import { syntheticInventory } from '../../src/domain/synthetic-inventory';
import type { Page } from '@playwright/test';
import { captureDraft, parseItem } from '../../src/domain/item';
import { applyCommand } from '../../src/domain/organize';
import { Timestamp } from 'firebase/firestore';

// Existing full-detail workflows use the retained full view on desktop and phone.
export async function openFullView(page: Page): Promise<void> {
  const inspector = page.getByRole('region', { name: 'Item inspector', exact: true });
  if (await inspector.isVisible())
    await inspector.getByRole('button', { name: 'Open full view', exact: true }).click();
}

export async function seedExamples(): Promise<void> {
  assertLocalTarget('demo-inventory', process.env);
  const environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080 },
    storage: { host: '127.0.0.1', port: 19199 },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const root = (await db.doc('inventories/main').get()).data();
      if (root?.ownerUid !== LOCAL_ACCOUNTS.owner.uid || root.schemaVersion !== 2)
        throw new Error('Synthetic fixture requires the trusted v2 demo owner');
      const fixture = syntheticInventory();
      const batch = db.batch();
      for (const [collection, records] of [
        ['rooms', fixture.rooms],
        ['boxes', fixture.boxes],
        ['items', fixture.items],
      ] as const) {
        for (const { id, ...record } of records)
          batch.set(db.doc(`inventories/main/${collection}/${id}`), record);
      }
      await batch.commit();
    });
  } finally {
    await environment.cleanup();
  }
}

// A synthetic concurrent change exercises the short-lived Undo toast without timing a second UI.
export async function changeSyntheticNotes(name: string, notes: string): Promise<void> {
  assertLocalTarget('demo-inventory', process.env);
  if (!name.startsWith('Synthetic ') || !notes.startsWith('Synthetic '))
    throw new Error('Synthetic fixture only');
  const environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const root = (await db.doc('inventories/main').get()).data();
      if (root?.ownerUid !== LOCAL_ACCOUNTS.owner.uid || root.schemaVersion !== 2)
        throw new Error('Trusted demo owner required');
      const matches = await db.collection('inventories/main/items').where('name', '==', name).get();
      if (matches.size !== 1) throw new Error('One synthetic fixture required');
      const record = matches.docs[0]!;
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(record.ref);
        const item = parseItem(snapshot.data(), 'main', snapshot.id);
        if (item.name !== name) throw new Error('Synthetic record changed');
        transaction.update(record.ref, {
          notes,
          revision: item.revision + 1,
          updatedAt: Timestamp.now(),
        });
      });
    });
  } finally {
    await environment.cleanup();
  }
}

/**
 * Live listeners deliver outside edits before the next click, so a stale-tab conflict must be
 * raced into a running operation: the page's first transaction commit waits for `change`.
 */
export async function raceFirstCommit(page: Page, change: () => Promise<void>): Promise<void> {
  let raced = false;
  await page.route(
    (url) => url.pathname.endsWith('/documents:commit'),
    async (route) => {
      if (!raced) {
        raced = true;
        await change();
      }
      await route.continue();
    },
  );
}

// Makes the trusted demo root briefly invalid (or valid again) to exercise listener failure.
export async function setSyntheticDisplayName(displayName: string): Promise<void> {
  assertLocalTarget('demo-inventory', process.env);
  if (displayName && !displayName.startsWith('Synthetic '))
    throw new Error('Synthetic fixture only');
  const environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080 },
  });
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const reference = context.firestore().doc('inventories/main');
      const root = (await reference.get()).data();
      if (root?.ownerUid !== LOCAL_ACCOUNTS.owner.uid || root.schemaVersion !== 2)
        throw new Error('Trusted demo owner required');
      await reference.update({ displayName, updatedAt: Timestamp.now() });
    });
  } finally {
    await environment.cleanup();
  }
}

const SELLING_EXAMPLES = [
  ['Synthetic sale chair', { amountMinor: 12050, currency: 'CHF' }, 'not_started'],
  ['Synthetic sale table', { amountMinor: 3000, currency: 'CHF' }, 'in_progress'],
  ['Synthetic sale radio', null, 'not_started'],
  ['Synthetic sale kettle', { amountMinor: 25000, currency: 'SEK' }, 'not_started'],
  ['Synthetic sold bicycle', { amountMinor: 40000, currency: 'CHF' }, 'completed'],
] as const;
// CHF and SEK appear in no other browser fixture, so their totals stay exact in the shared emulator.
export async function withSellingExamples(run: () => Promise<void>): Promise<void> {
  assertLocalTarget('demo-inventory', process.env);
  const environment = await initializeTestEnvironment({
    projectId: 'demo-inventory',
    firestore: { host: '127.0.0.1', port: 18080 },
  });
  const time = Timestamp.now();
  const paths = SELLING_EXAMPLES.map((_, index) => `inventories/main/items/seed-selling-${index}`);
  try {
    await environment.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const root = (await db.doc('inventories/main').get()).data();
      if (root?.ownerUid !== LOCAL_ACCOUNTS.owner.uid || root.schemaVersion !== 2)
        throw new Error('Synthetic fixture requires the trusted v2 demo owner');
      const batch = db.batch();
      SELLING_EXAMPLES.forEach(([name, value, progress], index) => {
        let record = captureDraft(
          { name, roomId: null, photos: [], reviewStatus: 'reviewed' },
          time,
        );
        record = applyCommand(
          { ...record, recordState: 'ready', estimatedValue: value },
          { kind: 'decision', decision: 'sell' },
          time,
        );
        if (progress !== 'not_started')
          record = applyCommand(record, { kind: 'progress', progress }, time);
        batch.set(db.doc(paths[index]!), record);
      });
      await batch.commit();
    });
    await run();
  } finally {
    try {
      await environment.withSecurityRulesDisabled(async (context) => {
        const batch = context.firestore().batch();
        for (const path of paths) batch.delete(context.firestore().doc(path));
        await batch.commit();
      });
    } finally {
      await environment.cleanup();
    }
  }
}
