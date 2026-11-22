import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { DEMO_PROJECT_ID, ID_PATTERN } from '../src/data/config.ts';
import { loadEnvironment } from './environment.mjs';
import { assertLocalTarget } from './safety.ts';
import { assertEmulatorsRunning } from './health.ts';
import { jsonApiTransport, migratePhotoCache } from './photo-cache.ts';

// Rewrites only the Cache-Control metadata of existing photo objects. Bytes, download tokens
// and Firestore records are never touched. Dry run unless --apply is given.
const usage =
  'Usage: npm run photos:cache -- (--emulator | --project PROJECT_ID --bucket BUCKET) --inventory ID [--apply]';
const { values } = parseArgs({
  options: {
    emulator: { type: 'boolean', default: false },
    project: { type: 'string' },
    bucket: { type: 'string' },
    inventory: { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
  strict: true,
  allowPositionals: false,
});
const inventory = values.inventory ?? '';
if (!ID_PATTERN.test(inventory)) throw new Error(`Supply an explicit inventory ID. ${usage}`);

let transport;
let target;
if (values.emulator) {
  if (values.project || values.bucket)
    throw new Error(`--emulator uses the local demo project; omit --project/--bucket. ${usage}`);
  const { config } = await loadEnvironment('local');
  const endpoints = config.emulators;
  if (config.firebase.projectId !== DEMO_PROJECT_ID || !endpoints)
    throw new Error('Emulator mode requires the local demo-inventory configuration');
  assertLocalTarget(config.firebase.projectId, {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: `${endpoints.host}:${endpoints.auth}`,
    FIRESTORE_EMULATOR_HOST: `${endpoints.host}:${endpoints.firestore}`,
    FIREBASE_STORAGE_EMULATOR_HOST: `${endpoints.host}:${endpoints.storage}`,
  });
  await assertEmulatorsRunning(config);
  target = `emulator bucket ${config.firebase.storageBucket}`;
  transport = jsonApiTransport({
    base: `http://${endpoints.host}:${endpoints.storage}`,
    bucket: config.firebase.storageBucket,
    authorization: async () => 'Bearer owner',
  });
} else {
  const project = values.project ?? '';
  const bucket = values.bucket ?? '';
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project) || project === DEMO_PROJECT_ID)
    throw new Error(`Supply an explicit cloud project. ${usage}`);
  // Only the project's own default Firebase buckets are accepted, so a typo cannot reach another.
  if (![`${project}.firebasestorage.app`, `${project}.appspot.com`].includes(bucket))
    throw new Error(`--bucket must be ${project}.firebasestorage.app or ${project}.appspot.com`);
  const require = createRequire(import.meta.url);
  const auth = require('firebase-tools/lib/auth');
  const { requireAuth } = require('firebase-tools/lib/requireAuth');
  const apiv2 = require('firebase-tools/lib/apiv2');
  const options = { project, nonInteractive: true };
  const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && account)
    auth.setActiveAccount(options, account);
  await requireAuth(options);
  target = `gs://${bucket}`;
  transport = jsonApiTransport({
    base: 'https://storage.googleapis.com/storage/v1',
    bucket,
    authorization: async () => `Bearer ${await apiv2.getAccessToken()}`,
  });
}

console.log(
  `${values.apply ? 'Updating' : 'Dry run for'} photo Cache-Control in ${target}, inventory ${inventory}.`,
);
const report = await migratePhotoCache({
  transport,
  inventory,
  apply: values.apply,
  log: (line) => console.log(line),
});
for (const entry of report.skipped) console.log(`Skipped ${entry.name}: ${entry.reason}`);
for (const entry of report.failed) console.error(`Failed ${entry.name}: ${entry.reason}`);
if (!values.apply && report.pending)
  console.log(`Rerun with --apply to update ${report.pending} legacy photo objects.`);
if (report.failed.length) process.exitCode = 1;
