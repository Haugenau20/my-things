import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/data/config';

export const localEnv = {
  VITE_APP_ENV: 'local',
  VITE_USE_EMULATORS: 'true',
  VITE_INVENTORY_ID: 'main',
  VITE_FIREBASE_API_KEY: 'demo-not-a-real-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-inventory.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-inventory',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-inventory.firebasestorage.app',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
  VITE_EMULATOR_HOST: '127.0.0.1',
  VITE_AUTH_EMULATOR_PORT: '9099',
  VITE_FIRESTORE_EMULATOR_PORT: '8080',
  VITE_STORAGE_EMULATOR_PORT: '9199',
};

describe('fail-closed environment configuration', () => {
  it('accepts the complete demo configuration', () => {
    expect(validateConfig(localEnv)).toMatchObject({
      environment: 'local',
      inventoryId: 'main',
      firebase: { projectId: 'demo-inventory' },
      emulators: { host: '127.0.0.1', auth: 9099, firestore: 8080, storage: 9199 },
    });
  });
  it.each(Object.keys(localEnv))('rejects missing %s', (key) => {
    const env: Record<string, unknown> = { ...localEnv };
    delete env[key];
    expect(() => validateConfig(env)).toThrow();
  });
  it.each([
    ['VITE_FIREBASE_PROJECT_ID', 'real-cloud-project'],
    ['VITE_USE_EMULATORS', 'false'],
    ['VITE_EMULATOR_HOST', 'cloud.example.com'],
    ['VITE_AUTH_EMULATOR_PORT', '0'],
    ['VITE_STORAGE_EMULATOR_PORT', '65536'],
    ['VITE_FIRESTORE_EMULATOR_PORT', '9099'],
    ['VITE_INVENTORY_ID', '../foreign'],
    ['VITE_APP_ENV', 'staging'],
    ['VITE_FIREBASE_STORAGE_BUCKET', 'some-real-bucket'],
    ['VITE_FIREBASE_AUTH_DOMAIN', 'some-real-project.firebaseapp.com'],
  ])('rejects unsafe %s', (key, value) => {
    expect(() => validateConfig({ ...localEnv, [key]: value })).toThrow();
  });
  it('rejects nonstring configuration values', () => {
    expect(() => validateConfig({ ...localEnv, VITE_USE_EMULATORS: true })).toThrow();
  });
  it('accepts explicit cloud configuration without emulator endpoints', () => {
    expect(
      validateConfig({
        VITE_APP_ENV: 'development',
        VITE_USE_EMULATORS: 'false',
        VITE_INVENTORY_ID: 'main',
        VITE_FIREBASE_API_KEY: 'synthetic-key',
        VITE_FIREBASE_APP_ID: 'synthetic-app',
        VITE_FIREBASE_PROJECT_ID: 'synthetic-development',
        VITE_FIREBASE_STORAGE_BUCKET: 'synthetic-development.firebasestorage.app',
        VITE_FIREBASE_AUTH_DOMAIN: 'synthetic-development.firebaseapp.com',
      }),
    ).toMatchObject({ environment: 'development', emulators: null });
  });
  it('rejects any cloud mode using demo configuration or emulator flags', () => {
    expect(() => validateConfig({ ...localEnv, VITE_APP_ENV: 'production' })).toThrow();
  });
});
