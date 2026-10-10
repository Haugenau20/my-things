import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item } from '../domain/item';
import { permanentlyDelete } from '../media/permanent-deletion';

export function DeletionDialog({
  item,
  services,
  inventoryId,
  signal,
  reload,
  closed,
  completed,
}: {
  item: Item;
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  reload: () => Promise<void>;
  closed: () => void;
  completed: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [controller] = useState(() => new AbortController());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const element = dialog.current;
    element?.showModal();
    return () => {
      signal.removeEventListener('abort', abort);
      controller.abort();
      element?.close();
    };
  }, [controller, signal]);
  async function perform() {
    setBusy(true);
    setError('');
    try {
      await permanentlyDelete(
        services,
        inventoryId,
        item,
        controller.signal,
        (message) => {
          if (!controller.signal.aborted) setStatus(message);
        },
        reload,
      );
      controller.signal.throwIfAborted();
      await completed();
    } catch {
      if (!controller.signal.aborted) {
        setStatus('');
        setError(
          'Deletion is unfinished or unconfirmed. Close and refresh to check the item, then retry its recovery marker. Failed photo cleanup never automatically removes the final record.',
        );
        await reload();
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="permanent-deletion-title"
      className="deletion-dialog"
      onCancel={(event) => {
        event.preventDefault();
        closed();
      }}
    >
      <h2 id="permanent-deletion-title">Permanently delete {item.name}?</h2>
      <p>
        This item and its live photo files cannot be restored from application trash after deletion.
        Its recovery marker stays until cleanup finishes.
      </p>
      <p className="supporting">
        Cloud Storage may retain billed copies under its retention policy. Stopping leaves any
        unfinished cleanup for retry; writes already submitted may still finish.
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <div className="save-actions">
        <button className="primary-button" disabled={busy} onClick={() => void perform()}>
          {item.recordState === 'deleting'
            ? 'Continue permanent deletion'
            : 'Confirm permanent deletion'}
        </button>
        <button className="secondary-button" onClick={closed}>
          {busy ? 'Stop and close' : 'Close'}
        </button>
      </div>
    </dialog>
  );
}
export function DeletionRecovery({ items, open }: { items: Item[]; open: (item: Item) => void }) {
  if (!items.length) return null;
  return (
    <section className="recovery-panel" aria-label="Unfinished permanent deletions">
      <h2>Unfinished permanent deletions</h2>
      <p>
        These items were marked for permanent deletion. Cleanup must finish before their records
        disappear.
      </p>
      {items.map((item) => (
        <article className="recovery-item" key={item.id}>
          <h3>{item.name}</h3>
          <button className="secondary-button" onClick={() => open(item)}>
            Retry permanent deletion
          </button>
        </article>
      ))}
    </section>
  );
}
