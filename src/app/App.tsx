import { useEffect, useRef, useState } from 'react';
import {
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import type { AppConfig } from '../data/config';
import type { FirebaseServices } from '../data/firebase';
import { loadInventory } from '../data/inventory-repository';
import { googleSignInError } from '../data/auth-error';
import { LOCAL_ACCOUNTS } from '../data/local-accounts';
import type { Inventory } from '../domain/inventory';
import { InventoryWorkspace } from './InventoryWorkspace';

type AccessState =
  | { kind: 'signed-out' | 'checking' | 'denied' | 'failed' }
  | { kind: 'authorized'; inventory: Inventory };

function denied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'permission-denied'
  );
}

export function App({
  config,
  services,
}: {
  config: AppConfig;
  services: FirebaseServices | null;
}) {
  const [access, setAccess] = useState<AccessState>({ kind: services ? 'checking' : 'signed-out' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!services) return;
    const broadcast = new BroadcastChannel(
      `my-things:${config.environment}:${config.firebase.projectId}:${config.inventoryId}`,
    );
    channel.current = broadcast;
    if (config.environment !== 'local') {
      void getRedirectResult(services.auth).catch((failure: unknown) =>
        setError(googleSignInError(failure, 'finish')),
      );
    }
    broadcast.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data !== 'sign-out') return;
      ++requestVersion.current;
      setAccess({ kind: 'checking' });
      setError(null);
      void signOut(services.auth).catch(() => setAccess({ kind: 'failed' }));
    };
    const unsubscribe = onAuthStateChanged(
      services.auth,
      (user) => {
        const version = ++requestVersion.current;
        setError(null);
        if (!user) {
          setAccess({ kind: 'signed-out' });
          return;
        }
        setAccess({ kind: 'checking' });
        void loadInventory(services.db, config.inventoryId, user.uid).then(
          (inventory) => {
            // An older request must not restore private content after account change or sign-out.
            if (requestVersion.current === version && services.auth.currentUser?.uid === user.uid) {
              setAccess({ kind: 'authorized', inventory });
            }
          },
          (failure: unknown) => {
            if (requestVersion.current === version)
              setAccess({ kind: denied(failure) ? 'denied' : 'failed' });
          },
        );
      },
      () => setAccess({ kind: 'failed' }),
    );
    return () => {
      ++requestVersion.current;
      unsubscribe();
      broadcast.close();
      channel.current = null;
    };
  }, [config, services]);

  async function signIn(account: keyof typeof LOCAL_ACCOUNTS) {
    if (!services || config.environment !== 'local') return;
    setPending(true);
    setError(null);
    try {
      const fixture = LOCAL_ACCOUNTS[account];
      await signInWithEmailAndPassword(services.auth, fixture.email, fixture.password);
    } catch {
      setError('Could not sign in. Check the local emulators and synthetic seed, then try again.');
    } finally {
      setPending(false);
    }
  }

  async function leave() {
    if (!services) return;
    ++requestVersion.current;
    setAccess({ kind: 'checking' });
    setPending(true);
    setError(null);
    channel.current?.postMessage('sign-out');
    try {
      await signOut(services.auth);
      setAccess({ kind: 'signed-out' });
    } catch {
      setAccess({ kind: 'failed' });
      setError('Sign-out could not finish. Please try again.');
    } finally {
      setPending(false);
    }
  }
  async function googleSignIn() {
    if (!services || config.environment === 'local') return;
    setError(null);
    if (window.location.origin !== `https://${config.firebase.authDomain}`) {
      setError(
        `Open https://${config.firebase.authDomain} to sign in. The app and authentication helper must share their origin.`,
      );
      return;
    }
    setPending(true);
    try {
      await signInWithRedirect(services.auth, new GoogleAuthProvider());
    } catch (failure: unknown) {
      setError(googleSignInError(failure, 'start'));
      setPending(false);
    }
  }

  return (
    <>
      {access.kind !== 'authorized' && (
        <header className="site-header">
          <a className="wordmark" href="/" aria-label="My things home">
            <span className="brand-mark" aria-hidden="true">
              m.
            </span>{' '}
            my things
          </a>
          <span className="environment-label">
            {config.environment === 'local'
              ? 'Local preview · synthetic data'
              : 'Private inventory'}
          </span>
          {services?.auth.currentUser && (
            <button className="text-button" disabled={pending} onClick={() => void leave()}>
              Sign out
            </button>
          )}
        </header>
      )}
      {access.kind === 'authorized' && services ? (
        <InventoryWorkspace
          key={access.inventory.ownerUid}
          inventory={access.inventory}
          inventoryId={config.inventoryId}
          services={services}
          environment={config.environment}
          signOut={leave}
          signOutPending={pending}
        />
      ) : (
        <main className="shell">
          <section className="intro" aria-live="polite">
            <p className="eyebrow">A little order. A lighter move.</p>
            {access.kind === 'signed-out' && (
              <>
                <h1>
                  Your things,
                  <br />
                  together.
                </h1>
                <p className="description">
                  A private place for what you own, where it lives, and what comes with you.
                </p>
                {config.environment === 'local' ? (
                  <div className="actions">
                    <button
                      className="primary-button"
                      disabled={pending}
                      onClick={() => void signIn('owner')}
                    >
                      {pending ? 'Signing in…' : 'Sign in as test owner'}
                    </button>
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() => void signIn('unrelated')}
                    >
                      Test unauthorized account
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      className="primary-button"
                      disabled={pending}
                      onClick={() => void googleSignIn()}
                    >
                      Sign in with Google
                    </button>
                    <p className="supporting">Access is limited to the inventory owner.</p>
                  </>
                )}
                <p className="supporting">Capture your things, one at a time.</p>
              </>
            )}
            {access.kind === 'checking' && (
              <>
                <h1>Checking access…</h1>
                <p className="description" role="status">
                  Waiting for your private inventory.
                </p>
              </>
            )}
            {access.kind === 'denied' && (
              <>
                <h1>Access not granted</h1>
                <p className="description">
                  This account can sign in, but it does not have access to this inventory.
                </p>
                <p className="supporting">
                  Ownership must be configured by the project administrator.
                </p>
              </>
            )}
            {access.kind === 'failed' && (
              <>
                <h1>Could not open your inventory</h1>
                <p className="description">Check your connection and try again.</p>
                <button className="primary-button" onClick={() => window.location.reload()}>
                  Try again
                </button>
              </>
            )}
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
          </section>
          <aside className="illustration" aria-label="A place for everything">
            <div className="illustration-top">
              <span>Room for your next chapter</span>
              <span aria-hidden="true">↗</span>
            </div>
            <div className="still-life" aria-hidden="true">
              <div className="sun" />
              <div className="book book-one" />
              <div className="book book-two" />
              <div className="box box-back">
                <span />
              </div>
              <div className="box box-front">
                <span />
              </div>
              <div className="floor" />
            </div>
            <p>A place for everything.</p>
            <span className="illustration-caption">One thing at a time.</span>
          </aside>
        </main>
      )}
      {access.kind !== 'authorized' && (
        <footer className="site-footer">
          <span>Private by design.</span>
          <span>Made for the things that matter.</span>
        </footer>
      )}
    </>
  );
}
