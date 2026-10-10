import { expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { configFingerprint } from '../../scripts/release';
import { validateConfig, type AppConfig } from '../../src/data/config';

const require = createRequire(import.meta.url);
const cliStorage = require('firebase-tools/lib/gcp/storage.js') as {
  getDefaultBucket(project: string): Promise<string>;
};
const cliRules = require('firebase-tools/lib/rulesDeploy.js') as {
  RulesDeploy: { prototype: { compile(): Promise<void> } };
};
type StorageRule = { bucket: string; rules: string };
const prepareStorage = (
  require('firebase-tools/lib/deploy/storage/prepare.js') as {
    default(
      context: { storage?: { rulesConfigsToDeploy: StorageRule[] } },
      options: {
        project: string;
        only: string;
        config: { get(key: string): unknown; path(filename: string): string };
      },
    ): Promise<void>;
  }
).default;

it.each(['synthetic-photos.firebasestorage.app', 'synthetic-photos.appspot.com'])(
  'prepares rules for the configured bucket %s even when default discovery is unavailable',
  async (bucket) => {
    const temporaryRoot = resolve('.firebase');
    await mkdir(temporaryRoot, { recursive: true });
    const directory = await mkdtemp(join(temporaryRoot, 'release-test-'));
    if (!directory.startsWith(join(temporaryRoot, 'release-test-')))
      throw new Error('Refusing cleanup outside the synthetic release fixture directory.');
    const config: AppConfig = {
      environment: 'production',
      inventoryId: 'main',
      emulators: null,
      firebase: {
        projectId: 'synthetic-project',
        authDomain: 'synthetic-project.firebaseapp.com',
        storageBucket: bucket,
        apiKey: 'synthetic-key',
        appId: 'synthetic-app',
      },
    };
    try {
      await mkdir(join(directory, 'dist'));
      await writeFile(join(directory, 'firebase.json'), await readFile('firebase.json'));
      await writeFile(
        join(directory, 'storage.rules'),
        "rules_version = '2'; service firebase.storage { match /b/{bucket}/o { match /{path=**} { allow read, write: if false; } } }",
      );
      await writeFile(
        join(directory, '.env.production.local'),
        [
          'VITE_APP_ENV=production',
          'VITE_USE_EMULATORS=false',
          'VITE_INVENTORY_ID=main',
          'APP_PRODUCTION_PROJECT_ID=synthetic-project',
          'VITE_FIREBASE_PROJECT_ID=synthetic-project',
          'VITE_FIREBASE_AUTH_DOMAIN=synthetic-project.firebaseapp.com',
          `VITE_FIREBASE_STORAGE_BUCKET=${bucket}`,
          'VITE_FIREBASE_API_KEY=synthetic-key',
          'VITE_FIREBASE_APP_ID=synthetic-app',
        ].join('\n'),
      );
      await writeFile(
        join(directory, 'dist/build-environment.json'),
        JSON.stringify({
          environment: 'production',
          projectId: 'synthetic-project',
          inventoryId: 'main',
        }),
      );
      const builtConfig = validateConfig(
        parseEnv(await readFile(join(directory, '.env.production.local'), 'utf8')),
      );
      await writeFile(join(directory, 'dist/build-config.sha256'), configFingerprint(builtConfig));
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(VITE_|APP_|GOOGLE_|GCLOUD_|GCP_|CLOUDSDK_|FIREBASE_)/.test(key),
        ),
      );
      execFileSync(process.execPath, [resolve('scripts/prepare-release.mjs')], {
        cwd: directory,
        env,
        timeout: 10000,
      });
      const release: unknown = JSON.parse(
        await readFile(join(directory, '.firebase/production.firebase.json'), 'utf8'),
      );
      const storage = (release as { storage: unknown }).storage;
      // Only cloud operations are replaced; the real pinned CLI reads and selects the rule file.
      const discovery = vi
        .spyOn(cliStorage, 'getDefaultBucket')
        .mockRejectedValue(
          Object.assign(new Error('Synthetic default-bucket discovery failure'), { status: 404 }),
        );
      vi.spyOn(cliRules.RulesDeploy.prototype, 'compile').mockResolvedValue();
      const context: { storage?: { rulesConfigsToDeploy: StorageRule[] } } = {};
      await prepareStorage(context, {
        project: config.firebase.projectId,
        only: 'storage',
        config: { get: () => storage, path: (filename) => filename },
      });
      expect(context.storage?.rulesConfigsToDeploy).toEqual([
        { bucket, rules: join(directory, 'storage.rules') },
      ]);
      expect(discovery).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
