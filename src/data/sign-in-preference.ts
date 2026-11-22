import { browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth';
import type { Auth } from 'firebase/auth';

// A non-secret per-device choice. Firebase keeps the sign-in itself; this only selects whether it
// survives closing the tab (session storage) or stays until Sign out (local storage).
const KEY = 'my-things:keep-signed-in';

export function keepSignedIn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function remember(value: boolean) {
  try {
    if (value) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage the choice cannot persist; session sign-in still works.
  }
}

/** Applies the checkbox choice before signing in. Returns false when it could not be kept. */
export async function applySignInChoice(auth: Auth, keep: boolean): Promise<boolean> {
  if (keep) {
    try {
      await setPersistence(auth, browserLocalPersistence);
      remember(true);
      return keepSignedIn();
    } catch {
      // Fall through to the session default.
    }
  }
  await setPersistence(auth, browserSessionPersistence);
  remember(false);
  return !keep;
}

/** Sign-out forgets the device choice so the next sign-in starts from the safer default. */
export function forgetSignInChoice(): void {
  remember(false);
}
