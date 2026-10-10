import { describe, expect, it } from 'vitest';
import { assertBuildTarget, assertDeployment, assertLocalTarget } from '../../scripts/safety';

const endpoints = {
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
};

describe('trusted local tooling isolation', () => {
  it('accepts only the explicit demo project and complete loopback endpoints', () => {
    expect(() => assertLocalTarget('demo-inventory', endpoints)).not.toThrow();
  });
  it('rejects cloud targets before privileged tooling can run', () => {
    expect(() => assertLocalTarget('synthetic-production', endpoints)).toThrow();
  });
  it.each(Object.keys(endpoints))('rejects missing %s', (key) => {
    const env: Record<string, unknown> = { ...endpoints };
    delete env[key];
    expect(() => assertLocalTarget('demo-inventory', env)).toThrow();
  });
  it('rejects a remote emulator endpoint', () => {
    expect(() =>
      assertLocalTarget('demo-inventory', {
        ...endpoints,
        FIRESTORE_EMULATOR_HOST: 'cloud.example.com:8080',
      }),
    ).toThrow();
  });
  it('accepts the explicitly isolated test suite endpoints', () => {
    expect(() =>
      assertLocalTarget('demo-inventory', {
        MY_THINGS_TEST_EMULATORS: 'true',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:18080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:19199',
      }),
    ).not.toThrow();
  });
});

describe('cloud build and deployment isolation', () => {
  const targets = {
    APP_DEVELOPMENT_PROJECT_ID: 'synthetic-development',
    APP_PRODUCTION_PROJECT_ID: 'synthetic-production',
  };
  const config = {
    environment: 'production',
    inventoryId: 'main',
    firebase: { projectId: 'synthetic-production' },
    emulators: null,
  };
  it('allows an explicit matching production build', () => {
    expect(() => assertBuildTarget(config, 'production', targets)).not.toThrow();
  });
  it.each([undefined, ''])(
    'allows production without a cloud development project (%s)',
    (development) => {
      expect(() =>
        assertBuildTarget(config, 'production', {
          APP_PRODUCTION_PROJECT_ID: 'synthetic-production',
          APP_DEVELOPMENT_PROJECT_ID: development,
        }),
      ).not.toThrow();
    },
  );
  it.each([null, 'demo-inventory', 'not a project'])(
    'rejects an invalid optional development ID (%s)',
    (development) => {
      expect(() =>
        assertBuildTarget(config, 'production', {
          ...targets,
          APP_DEVELOPMENT_PROJECT_ID: development,
        }),
      ).toThrow();
    },
  );
  it('never treats the production project as an implicit development target', () => {
    expect(() =>
      assertBuildTarget({ ...config, environment: 'development' }, 'development', {
        APP_PRODUCTION_PROJECT_ID: 'synthetic-production',
      }),
    ).toThrow();
  });
  it('rejects development credentials baked into a production build', () => {
    expect(() =>
      assertBuildTarget(
        {
          ...config,
          firebase: {
            projectId: 'synthetic-development',
          },
        },
        'production',
        targets,
      ),
    ).toThrow();
  });
  it('rejects development and production sharing a project', () => {
    expect(() =>
      assertBuildTarget(config, 'production', {
        ...targets,
        APP_DEVELOPMENT_PROJECT_ID: 'synthetic-production',
      }),
    ).toThrow();
  });
  it('rejects a missing environment destination', () => {
    expect(() => assertBuildTarget(config, 'production', {})).toThrow();
  });
  it('rejects a mismatched build mode', () => {
    expect(() => assertBuildTarget(config, 'development', targets)).toThrow();
  });
  const manifest = {
    environment: 'production',
    projectId: 'synthetic-production',
    inventoryId: 'main',
  };
  it('accepts matching baked-in deployment metadata', () => {
    expect(() => assertDeployment(manifest, manifest)).not.toThrow();
  });
  it.each([
    { environment: 'local', projectId: 'demo-inventory', inventoryId: 'main' },
    { ...manifest, projectId: 'synthetic-development' },
    { ...manifest, inventoryId: 'different' },
    { ...manifest, environment: 'development' },
  ])('rejects an unsafe deployment build', (build) => {
    expect(() => assertDeployment(build, manifest)).toThrow();
  });
});
