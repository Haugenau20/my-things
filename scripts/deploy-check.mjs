import { readFile } from 'node:fs/promises';
import { assertDeployment } from './safety.ts';

const [environment, projectId, inventoryId] = process.argv.slice(2);
assertDeployment(JSON.parse(await readFile('dist/build-environment.json', 'utf8')), {
  environment,
  projectId,
  inventoryId,
});
console.log('Build matches the explicit destination. No deployment performed.');
