import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEMO_PROJECT_ID } from '../src/data/config.ts';
import { assertLocalTarget, LOCAL_ENDPOINTS, TEST_ENDPOINTS } from './safety.ts';
import { runNode } from './process.mjs';

const action = process.argv[2];
const commands = {
  rules: 'node node_modules/vitest/vitest.mjs run --config vitest.rules.config.ts',
  integration: 'node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts',
  e2e: 'node scripts/seed-local.mjs && node node_modules/@playwright/test/cli.js test',
};
if (action !== 'start' && !Object.hasOwn(commands, action))
  throw new Error('Unknown emulator action');
const env = {
  ...process.env,
  ...(action === 'start' ? LOCAL_ENDPOINTS : TEST_ENDPOINTS),
  GCLOUD_PROJECT: DEMO_PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: DEMO_PROJECT_ID,
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
  FIREBASE_EMULATORS_PATH: resolve('.firebase-emulators'),
};
delete env.NO_COLOR;
if (action === 'start') delete env.MY_THINGS_TEST_EMULATORS;
else {
  env.MY_THINGS_TEST_EMULATORS = 'true';
  env.VITE_APP_ENV = 'local';
  env.VITE_USE_EMULATORS = 'true';
  env.VITE_FIREBASE_PROJECT_ID = DEMO_PROJECT_ID;
  env.VITE_EMULATOR_HOST = '127.0.0.1';
  env.VITE_AUTH_EMULATOR_PORT = '19099';
  env.VITE_FIRESTORE_EMULATOR_PORT = '18080';
  env.VITE_STORAGE_EMULATOR_PORT = '19199';
}
assertLocalTarget(DEMO_PROJECT_ID, env);
const java = spawnSync('java', ['-version'], { encoding: 'utf8', windowsHide: true });
if (java.status !== 0 || !/version "(?:2[1-9]|[3-9]\d)\./.test(java.stderr)) {
  throw new Error('Java 21 or newer is required; run through mise');
}
const args = [
  action === 'start' ? 'emulators:start' : 'emulators:exec',
  '--project',
  DEMO_PROJECT_ID,
  '--only',
  'auth,firestore,storage',
];
if (action !== 'start') {
  const config = JSON.parse(await readFile('firebase.json', 'utf8'));
  config.emulators = {
    auth: { host: '127.0.0.1', port: 19099 },
    firestore: { host: '127.0.0.1', port: 18080, websocketPort: 19150 },
    storage: { host: '127.0.0.1', port: 19199 },
    hub: { host: '127.0.0.1', port: 14400 },
    logging: { host: '127.0.0.1', port: 14500 },
    ui: { enabled: false },
    singleProjectMode: true,
  };
  await writeFile('firebase.test.generated.json', JSON.stringify(config, null, 2));
  args.push('--config', 'firebase.test.generated.json', commands[action]);
}
await runNode('node_modules/firebase-tools/lib/bin/firebase.js', args, env);
