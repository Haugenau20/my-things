export type Environment = 'local' | 'development' | 'production';

export type AppConfig = {
  environment: Environment;
  inventoryId: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    appId: string;
  };
  emulators: { host: string; auth: number; firestore: number; storage: number } | null;
};

export const DEMO_PROJECT_ID = 'demo-inventory';
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function required(env: Record<string, unknown>, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new Error(`Missing or invalid ${key}`);
  }
  return value;
}

export function validateConfig(env: Record<string, unknown>): AppConfig {
  const environment = required(env, 'VITE_APP_ENV');
  if (!['local', 'development', 'production'].includes(environment)) {
    throw new Error('VITE_APP_ENV must be local, development, or production');
  }
  const inventoryId = required(env, 'VITE_INVENTORY_ID');
  if (!ID_PATTERN.test(inventoryId)) throw new Error('Invalid inventory ID');
  const firebase = {
    apiKey: required(env, 'VITE_FIREBASE_API_KEY'),
    authDomain: required(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: required(env, 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: required(env, 'VITE_FIREBASE_STORAGE_BUCKET'),
    appId: required(env, 'VITE_FIREBASE_APP_ID'),
  };
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebase.projectId)) {
    throw new Error('Invalid Firebase project ID');
  }
  if (
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(firebase.authDomain) ||
    !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(firebase.storageBucket)
  ) {
    throw new Error('Auth domain and bucket must be names, not URLs');
  }
  const useEmulators = required(env, 'VITE_USE_EMULATORS');
  if (environment === 'local') {
    if (
      firebase.projectId !== DEMO_PROJECT_ID ||
      useEmulators !== 'true' ||
      firebase.authDomain !== `${DEMO_PROJECT_ID}.firebaseapp.com` ||
      firebase.storageBucket !== `${DEMO_PROJECT_ID}.firebasestorage.app`
    ) {
      throw new Error('Local mode requires the complete demo project configuration');
    }
    const host = required(env, 'VITE_EMULATOR_HOST');
    if (host !== '127.0.0.1') throw new Error('Local emulators must use 127.0.0.1');
    const port = (key: string): number => {
      const text = required(env, key);
      const value = Number(text);
      if (!/^\d+$/.test(text) || !Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid ${key}`);
      }
      return value;
    };
    const emulators = {
      host,
      auth: port('VITE_AUTH_EMULATOR_PORT'),
      firestore: port('VITE_FIRESTORE_EMULATOR_PORT'),
      storage: port('VITE_STORAGE_EMULATOR_PORT'),
    };
    if (new Set([emulators.auth, emulators.firestore, emulators.storage]).size !== 3) {
      throw new Error('Emulator ports must be distinct');
    }
    return { environment, inventoryId, firebase, emulators };
  }
  if (
    useEmulators !== 'false' ||
    firebase.projectId.startsWith('demo-') ||
    firebase.authDomain.startsWith('demo-') ||
    firebase.storageBucket.startsWith('demo-') ||
    [
      'VITE_EMULATOR_HOST',
      'VITE_AUTH_EMULATOR_PORT',
      'VITE_FIRESTORE_EMULATOR_PORT',
      'VITE_STORAGE_EMULATOR_PORT',
    ].some((key) => env[key] !== undefined && env[key] !== '')
  ) {
    throw new Error('Cloud modes reject demo IDs and emulator configuration');
  }
  return { environment: environment as Environment, inventoryId, firebase, emulators: null };
}
