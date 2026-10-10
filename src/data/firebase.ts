import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  browserSessionPersistence,
  connectAuthEmulator,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { validateConfig } from './config';

export type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
};

export function initializeFirebase(
  env: Record<string, unknown>,
  name = 'my-things',
): FirebaseServices {
  const config = validateConfig(env);
  if (config.environment !== 'local' || !config.emulators) {
    throw new Error('Cloud Firebase connections are deferred to M1');
  }
  const endpoints = config.emulators;
  const app = initializeApp(config.firebase, name);
  const auth = initializeAuth(app, {
    persistence: typeof window === 'undefined' ? inMemoryPersistence : browserSessionPersistence,
  });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const storage = getStorage(app);
  connectAuthEmulator(auth, `http://${endpoints.host}:${endpoints.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, endpoints.host, endpoints.firestore);
  connectStorageEmulator(storage, endpoints.host, endpoints.storage);
  return { app, auth, db, storage };
}
