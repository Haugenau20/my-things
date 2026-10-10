import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvironment } from './environment.mjs';
import { releaseSettings } from './release.ts';

const { config } = await loadEnvironment('production');
const manifest = JSON.parse(await readFile('dist/build-environment.json', 'utf8'));
const fingerprint = (await readFile('dist/build-config.sha256', 'utf8')).trim();
const { csp, cors } = releaseSettings(config, manifest, fingerprint);
const base = JSON.parse(await readFile('firebase.json', 'utf8'));
const hosting = {
  ...base.hosting,
  site: config.firebase.projectId,
  public: resolve('dist'),
  headers: base.hosting.headers.map((rule) => ({
    ...rule,
    headers: rule.headers.map((header) =>
      header.key === 'Content-Security-Policy' ? { ...header, value: csp } : header,
    ),
  })),
};
const release = {
  firestore: { rules: resolve(base.firestore.rules), indexes: resolve(base.firestore.indexes) },
  storage: [{ bucket: config.firebase.storageBucket, rules: resolve(base.storage.rules) }],
  hosting,
};
await mkdir('.firebase', { recursive: true });
await writeFile('.firebase/production.firebase.json', JSON.stringify(release, null, 2) + '\n');
await writeFile('.firebase/production.cors.json', JSON.stringify(cors, null, 2) + '\n');
console.log(
  'Prepared ignored production Hosting/rules configuration and exact-origin CORS for review. No cloud action performed.',
);
