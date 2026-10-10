import { loadEnvironment } from './environment.mjs';
import { assertEmulatorsRunning } from './health.ts';
import { runNode } from './process.mjs';

const { config } = await loadEnvironment('local');
await assertEmulatorsRunning(config);
await runNode('node_modules/vite/bin/vite.js', [
  '--mode',
  'emulator',
  '--host',
  '127.0.0.1',
  '--port',
  '5173',
  '--strictPort',
]);
