import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

it.each(['synthetic-production.firebaseapp.com', 'things.muninn.quest', 'unreviewed.example'])(
  'publishes only a validated app origin to GitHub outputs: %s',
  async (authDomain) => {
    const temporaryRoot = resolve('.firebase');
    await mkdir(temporaryRoot, { recursive: true });
    const directory = await mkdtemp(join(temporaryRoot, 'ci-test-'));
    if (!directory.startsWith(join(temporaryRoot, 'ci-test-')))
      throw new Error('Refusing cleanup outside the synthetic CI fixture directory.');
    const output = join(directory, 'output.txt');
    try {
      await writeFile(output, 'existing-output=retained\n');
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) =>
            !/^(VITE_|APP_|GOOGLE_|GCLOUD_|GCP_|CLOUDSDK_|FIREBASE_|GITHUB_OUTPUT)/.test(key),
        ),
      );
      const result = spawnSync(
        process.execPath,
        [resolve('scripts/prepare-ci.mjs'), 'production'],
        {
          cwd: directory,
          env: {
            ...env,
            APP_PRODUCTION_PROJECT_ID: 'synthetic-production',
            FIREBASE_WEB_CONFIG: JSON.stringify({
              apiKey: 'synthetic-public-key',
              authDomain,
              projectId: 'synthetic-production',
              storageBucket: 'synthetic-production.firebasestorage.app',
              appId: '1:123456:web:abcdef',
            }),
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
        },
      );
      if (authDomain === 'unreviewed.example') {
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          'Set FIREBASE_WEB_CONFIG to valid public SDK JSON matching the production project.',
        );
        expect(await readFile(output, 'utf8')).toBe('existing-output=retained\n');
        await expect(readFile(join(directory, '.env.production.local'))).rejects.toThrow();
      } else {
        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(output, 'utf8')).toBe(
          `existing-output=retained\norigin=https://${authDomain}\n`,
        );
      }
      expect(result.stdout + result.stderr).not.toContain('synthetic-public-key');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
