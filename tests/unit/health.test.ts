import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { assertEmulatorsRunning } from '../../scripts/health';
import type { AppConfig } from '../../src/data/config';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  servers.length = 0;
});

async function service(redirectRoot = false, warming = false): Promise<number> {
  let requests = 0;
  const server = createServer((request, response) => {
    if (warming && requests++ === 0) response.writeHead(503).end();
    else if (redirectRoot && request.url === '/')
      response.writeHead(302, { Location: '/ui' }).end();
    else response.writeHead(200).end('{}');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  return address.port;
}

const config = (ports: number[]): AppConfig => ({
  environment: 'local',
  inventoryId: 'main',
  firebase: {
    projectId: 'demo-inventory',
    apiKey: 'demo',
    appId: 'demo',
    authDomain: 'demo-inventory.firebaseapp.com',
    storageBucket: 'demo-inventory.firebasestorage.app',
  },
  emulators: { host: '127.0.0.1', auth: ports[0]!, firestore: ports[1]!, storage: ports[2]! },
});

describe('all-service startup preflight', () => {
  it('waits for a warming emulator before allowing synthetic seeding', async () => {
    await expect(
      assertEmulatorsRunning(
        config(await Promise.all([service(), service(true, true), service()])),
      ),
    ).resolves.toBeUndefined();
  });
  it('accepts all three reachable local services', async () => {
    await expect(
      assertEmulatorsRunning(config(await Promise.all([service(), service(), service()]))),
    ).resolves.toBeUndefined();
  });
  it('checks service endpoints rather than emulator UI redirects', async () => {
    await expect(
      assertEmulatorsRunning(
        config(await Promise.all([service(true), service(true), service(true)])),
      ),
    ).resolves.toBeUndefined();
  });
  it.each([0, 1, 2])('rejects missing service %i', async (index) => {
    const ports = await Promise.all([service(), service(), service()]);
    await new Promise<void>((resolve) => servers[index]!.close(() => resolve()));
    await expect(assertEmulatorsRunning(config(ports))).rejects.toThrow();
  });
  it('rejects a nonlocal config without making requests', async () => {
    await expect(
      assertEmulatorsRunning({ ...config([1, 2, 3]), environment: 'production', emulators: null }),
    ).rejects.toThrow();
  });
});
