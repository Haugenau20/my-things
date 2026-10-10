import { z } from 'zod';
import { DEMO_PROJECT_ID, ID_PATTERN } from '../src/data/config.ts';

export const LOCAL_ENDPOINTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

export const TEST_ENDPOINTS = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:19199',
};

export function assertLocalTarget(projectId: string, env: Record<string, unknown>): void {
  const endpoints = env.MY_THINGS_TEST_EMULATORS === 'true' ? TEST_ENDPOINTS : LOCAL_ENDPOINTS;
  if (
    projectId !== DEMO_PROJECT_ID ||
    Object.entries(endpoints).some(([key, value]) => env[key] !== value)
  ) {
    throw new Error('Trusted local tooling requires demo-inventory and all loopback emulators');
  }
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
    if (env[key] && env[key] !== DEMO_PROJECT_ID)
      throw new Error('Conflicting cloud project setting');
  }
}

const buildConfig = z.object({
  environment: z.enum(['local', 'development', 'production']),
  firebase: z.object({ projectId: z.string() }),
  emulators: z.unknown(),
});

export function assertBuildTarget(
  config: unknown,
  mode: string,
  env: Record<string, unknown>,
): void {
  const value = buildConfig.parse(config);
  if (value.environment !== mode)
    throw new Error('Build mode does not match application environment');
  if (mode === 'local') {
    if (value.firebase.projectId !== DEMO_PROJECT_ID || !value.emulators) {
      throw new Error('Local builds require demo emulators');
    }
    return;
  }
  const development = env.APP_DEVELOPMENT_PROJECT_ID;
  const production = env.APP_PRODUCTION_PROJECT_ID;
  const realProject = (id: unknown): id is string =>
    typeof id === 'string' && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id) && !id.startsWith('demo-');
  if (
    !realProject(development) ||
    !realProject(production) ||
    development === production ||
    value.emulators !== null ||
    value.firebase.projectId !== (mode === 'development' ? development : production)
  ) {
    throw new Error(
      'Cloud builds require distinct, explicit, matching development and production IDs',
    );
  }
}

const deployment = z.strictObject({
  environment: z.enum(['development', 'production']),
  projectId: z
    .string()
    .regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/)
    .refine((id) => !id.startsWith('demo-')),
  inventoryId: z.string().regex(ID_PATTERN),
});

export function assertDeployment(manifest: unknown, target: unknown): void {
  const built = deployment.parse(manifest);
  const requested = deployment.parse(target);
  if (
    built.environment !== requested.environment ||
    built.projectId !== requested.projectId ||
    built.inventoryId !== requested.inventoryId
  ) {
    throw new Error(
      'Built environment, project, and inventory do not match the deployment destination',
    );
  }
}
