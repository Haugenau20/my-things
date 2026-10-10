import type { AppConfig } from '../src/data/config.ts';

export async function assertEmulatorsRunning(config: AppConfig): Promise<void> {
  if (
    config.environment !== 'local' ||
    config.firebase.projectId !== 'demo-inventory' ||
    config.emulators?.host !== '127.0.0.1'
  ) {
    throw new Error('Emulator preflight requires the local demo configuration');
  }
  const endpoints = config.emulators;
  const paths = {
    auth: '/emulator/v1/projects/demo-inventory/config',
    firestore: '/v1/projects/demo-inventory/databases/(default)/documents/inventories/main',
    storage: '/v0/b/demo-inventory.firebasestorage.app/o?prefix=inventories%2Fmain%2Fitems',
  };
  const checks = await Promise.allSettled(
    ['auth', 'firestore', 'storage'].map(async (service) => {
      const name = service as 'auth' | 'firestore' | 'storage';
      const port = endpoints[name];
      // A listening emulator can still be warming its first request; retry only this local probe.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(`http://${endpoints.host}:${port}${paths[name]}`, {
            signal: AbortSignal.timeout(2000),
            redirect: 'error',
          });
          await response.body?.cancel();
          if (response.status >= 500) throw new Error('Service is unhealthy');
          return;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
    }),
  );
  if (checks.some((result) => result.status === 'rejected')) {
    throw new Error(
      'Auth, Firestore, and Storage emulators must all be running; no cloud fallback',
    );
  }
}
