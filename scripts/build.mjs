import { writeFile } from 'node:fs/promises';
import { loadEnvironment } from './environment.mjs';
import { runNode } from './process.mjs';

const environment = process.argv[2];
if (!['local', 'development', 'production'].includes(environment))
  throw new Error('Unknown build mode');
const { config } = await loadEnvironment(environment);
await runNode('node_modules/vite/bin/vite.js', [
  'build',
  '--mode',
  environment === 'local' ? 'emulator' : environment,
]);
await writeFile(
  'dist/build-environment.json',
  JSON.stringify(
    {
      environment: config.environment,
      projectId: config.firebase.projectId,
      inventoryId: config.inventoryId,
    },
    null,
    2,
  ) + '\n',
);
