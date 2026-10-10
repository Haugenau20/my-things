import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  browserSessionPersistence,
  browserPopupRedirectResolver,
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
  const endpoints = config.emulators;
  const app = initializeApp(config.firebase, name);
  const auth = initializeAuth(app, {
    persistence: typeof window === 'undefined' ? inMemoryPersistence : browserSessionPersistence,
    ...(typeof window !== 'undefined' && config.environment !== 'local'
      ? { popupRedirectResolver: browserPopupRedirectResolver }
      : {}),
  });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const storage = getStorage(app);
  if (endpoints) {
    connectAuthEmulator(auth, `http://${endpoints.host}:${endpoints.auth}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, endpoints.host, endpoints.firestore);
    connectStorageEmulator(storage, endpoints.host, endpoints.storage);
  }
  return { app, auth, db, storage };
}
