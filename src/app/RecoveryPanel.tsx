import { useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, PhotoFile } from '../domain/item';
import { discardAttempt, recoverAttempt } from '../media/capture';
import { preparePhoto } from '../media/processing';
function sameFile(actual: PhotoFile, expected: PhotoFile): boolean {
  return (
    actual.sha256 === expected.sha256 &&
    actual.byteSize === expected.byteSize &&
    actual.width === expected.width &&
    actual.height === expected.height
  );
}

function RecoveryItem({
  item,
  services,
  inventoryId,
  signal,
  reload,
}: {
  item: Item;
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  reload: () => Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState('');
  async function perform(discard: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      if (discard) {
        setStatus('Discarding unfinished capture…');
        await discardAttempt(services, inventoryId, item, signal);
      } else {
        const prepared = [];
        if (files.length) {
          if (files.length !== item.photos.length)
            throw new Error('Reselect every original photo in its original order.');
          for (const [index, file] of files.entries()) {
            const photo = item.photos[index]!;
            const result = await preparePhoto(file, inventoryId, item.id, photo.id, signal);
            if (
              !sameFile(result.photo.detail, photo.detail) ||
              !sameFile(result.photo.thumbnail, photo.thumbnail)
            )
              throw new Error(
                'Reselected photos do not match these derivatives. Use the original browser and files, or explicitly discard this capture.',
              );
            prepared.push(result);
          }
        }
        await recoverAttempt(
          services,
          inventoryId,
          item,
          signal,
          (text) => {
            if (!signal.aborted) setStatus(text);
          },
          prepared,
        );
      }
      signal.throwIfAborted();
      await reload();
    } catch (failure) {
      if (!signal.aborted) {
        setStatus('');
        setError(
          discard
            ? 'Cleanup is unfinished. Its recovery marker remains; refresh and retry cleanup.'
            : failure instanceof Error
              ? failure.message
              : 'Could not finish this capture. Reselect original photos or explicitly discard it.',
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <article className="recovery-item">
      <h3>{item.name}</h3>
      <p className="supporting">
        {item.recordState === 'deleting'
          ? 'Cleanup needs to finish.'
          : 'Not saved yet. Verify uploaded files, or reselect all original photos in order.'}
      </p>
      {item.recordState === 'draft' && (
        <>
          <label>
            Reselect originals for {item.name}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              disabled={busy}
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <button className="secondary-button" disabled={busy} onClick={() => void perform(false)}>
            Verify & finish
          </button>
        </>
      )}
      {!confirmation ? (
        <button className="text-button" disabled={busy} onClick={() => setConfirmation(true)}>
          {item.recordState === 'deleting' ? 'Retry cleanup' : 'Discard unfinished capture'}
        </button>
      ) : (
        <div>
          <p>Remove this unfinished item and its uploaded photos? Your originals stay untouched.</p>
          <button className="secondary-button" disabled={busy} onClick={() => void perform(true)}>
            Confirm discard
          </button>
          <button className="text-button" disabled={busy} onClick={() => setConfirmation(false)}>
            Keep capture
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </article>
  );
}
export function RecoveryPanel(props: {
  items: Item[];
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  reload: () => Promise<void>;
}) {
  if (!props.items.length) return null;
  return (
    <section className="recovery-panel" aria-label="Unfinished captures">
      <h2>Unfinished captures</h2>
      <p>These attempts need your attention. They are excluded from your saved inventory.</p>
      {props.items.map((item) => (
        <RecoveryItem
          key={item.id + ':' + item.revision}
          item={item}
          services={props.services}
          inventoryId={props.inventoryId}
          signal={props.signal}
          reload={props.reload}
        />
      ))}
    </section>
  );
}
