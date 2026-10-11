import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { initializeFirebase } from '../../src/data/firebase';
import { LOCAL_ACCOUNTS } from '../../src/data/local-accounts';
import { saveAttempt } from '../../src/media/capture';
import { ensureDraft } from '../../src/data/capture-repository';
import { preparePhoto } from '../../src/media/processing';
import { ensureFile } from '../../src/media/files';
import { PhotoSession } from '../../src/media/photo-session';
import { CaptureForm } from '../../src/app/CaptureForm';
import { PhotoAttachment } from '../../src/app/PhotoAttachment';
import { RecoveryPanel } from '../../src/app/RecoveryPanel';

// Browser-only component regression harness. All reads/writes use the complete demo stack.
export async function mountRefreshFailure(kind: 'capture' | 'attachment' | 'recovery') {
  const services = initializeFirebase(
    {
      VITE_APP_ENV: 'local',
      VITE_USE_EMULATORS: 'true',
      VITE_INVENTORY_ID: 'main',
      VITE_FIREBASE_API_KEY: 'demo-not-a-real-api-key',
      VITE_FIREBASE_APP_ID: 'demo-app',
      VITE_FIREBASE_AUTH_DOMAIN: 'demo-inventory.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'demo-inventory',
      VITE_FIREBASE_STORAGE_BUCKET: 'demo-inventory.firebasestorage.app',
      VITE_EMULATOR_HOST: '127.0.0.1',
      VITE_AUTH_EMULATOR_PORT: '19099',
      VITE_FIRESTORE_EMULATOR_PORT: '18080',
      VITE_STORAGE_EMULATOR_PORT: '19199',
    },
    `diagnostic-refresh-${kind}`,
  );
  await signInWithEmailAndPassword(
    services.auth,
    LOCAL_ACCOUNTS.owner.email,
    LOCAL_ACCOUNTS.owner.password,
  );
  const signal = new AbortController().signal;
  const host = document.createElement('section');
  host.setAttribute('aria-label', 'Synthetic diagnostic harness');
  document.body.append(host);
  const root = createRoot(host);
  const failRefresh = async () => {
    throw new Error('Synthetic private SDK path inventories/main/items/private?token=secret');
  };
  const common = { services, inventoryId: 'main', signal };
  if (kind === 'capture') {
    root.render(
      createElement(CaptureForm, {
        ...common,
        rooms: [],
        onRoom: () => {},
        onSaved: failRefresh,
        onAttempt: async () => {},
        roomRequest: { sequence: 0, room: 'none' },
        defaultCurrency: null,
        session: new PhotoSession(services.storage),
        onOpen: () => {},
      }),
    );
    return;
  }
  const id = crypto.randomUUID();
  const input = {
    name: `Synthetic ${kind} refresh`,
    roomId: null,
    reviewStatus: 'needs_review' as const,
    photos: [],
  };
  if (kind === 'attachment') {
    const item = await saveAttempt(services, 'main', { id, input, prepared: [] }, signal, () => {});
    root.render(
      createElement(PhotoAttachment, {
        ...common,
        item,
        onSaved: failRefresh,
        onAttempt: async () => {},
      }),
    );
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((value) => resolve(value!), 'image/png'),
  );
  const prepared = await preparePhoto(
    new File([blob], 'synthetic.png', { type: 'image/png' }),
    'main',
    id,
    crypto.randomUUID(),
    signal,
  );
  const item = await ensureDraft(
    services.db,
    'main',
    id,
    { ...input, photos: [prepared.photo] },
    signal,
  );
  await ensureFile(services.storage, prepared.photo.detail, prepared.detail, signal, () => {});
  await ensureFile(
    services.storage,
    prepared.photo.thumbnail,
    prepared.thumbnail,
    signal,
    () => {},
  );
  root.render(createElement(RecoveryPanel, { ...common, items: [item], reload: failRefresh }));
}
