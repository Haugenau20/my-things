import { captureFailureDetail, PhotoOperationFailure } from '../media/capture-errors';
import { PhotoDiagnostics } from './PhotoDiagnostics';
import { useMutationState } from './mutation-activity';
import { useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item, PhotoFile } from '../domain/item';
import { discardAttempt, recoverAttempt } from '../media/capture';
import { preparePhoto } from '../media/processing';
import type { Sync } from './use-inventory';
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
  sync,
}: {
  item: Item;
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  sync: Sync;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useMutationState();
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState<string>();
  const [diagnosticFailure, setDiagnosticFailure] = useState<unknown>();
  const [status, setStatus] = useState('');
  const attachment = item.recordState === 'ready';
  const cleaning =
    item.recordState === 'deleting' || item.photos.some((photo) => photo.state === 'deleting');
  async function perform(discard: boolean) {
    let acknowledged = false;
    let settled: Item | null;
    setBusy(true);
    setError(undefined);
    setDiagnosticFailure(undefined);
    try {
      if (discard) {
        setStatus(attachment ? 'Canceling unfinished photos…' : 'Discarding unfinished capture…');
        settled = await discardAttempt(services, inventoryId, item, signal);
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
        settled = await recoverAttempt(
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
      acknowledged = true;
      setStatus('Photo operation finished.');
      sync(settled ? { items: [settled] } : { removedItems: [item.id] });
    } catch (failure) {
      if (!signal.aborted) {
        setDiagnosticFailure(acknowledged ? undefined : failure);
        if (!acknowledged) setStatus('');
        setError(
          acknowledged
            ? 'Photo operation finished, but the inventory could not refresh. Reload to see the updated inventory.'
            : discard
              ? 'Cleanup is unfinished. Its recovery marker remains; refresh and retry cleanup.'
              : failure instanceof PhotoOperationFailure
                ? `${captureFailureDetail(failure)} Could not finish this capture. Retry verification. Reselect original photos or explicitly discard it.`.trim()
                : failure instanceof Error
                  ? failure.message
                  : 'Could not finish this capture. Reselect original photos or explicitly discard it.',
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="recovery-item">
      <h3>{item.name}</h3>
      <p className="supporting">
        {cleaning
          ? 'Cleanup needs to finish.'
          : attachment
            ? 'Your item remains saved. Verify unfinished uploads, or reselect all original photos in order.'
            : 'Not saved yet. Verify uploaded files, or reselect all original photos in order.'}
      </p>
      {!cleaning && (
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
          {cleaning
            ? 'Retry cleanup'
            : attachment
              ? 'Cancel photo attachment'
              : 'Discard unfinished capture'}
        </button>
      ) : (
        <div>
          <p>
            {attachment
              ? 'Remove these unfinished photo uploads? Your saved item and originals stay untouched.'
              : 'Remove this unfinished item and its uploaded photos? Your originals stay untouched.'}
          </p>
          <button className="secondary-button" disabled={busy} onClick={() => void perform(true)}>
            Confirm discard
          </button>
          <button className="text-button" disabled={busy} onClick={() => setConfirmation(false)}>
            Keep capture
          </button>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {error && <PhotoDiagnostics failure={diagnosticFailure} />}
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
  sync: Sync;
}) {
  if (!props.items.length) return null;
  return (
    <section className="recovery-panel" aria-label="Unfinished captures">
      <h2>Unfinished captures</h2>
      <p>
        These attempts need your attention. New captures are not yet saved; items with unfinished
        photo attachments remain in your inventory.
      </p>
      {props.items.map((item) => (
        <RecoveryItem
          // Live updates change the revision while this entry's own operation runs; keep it mounted.
          key={item.id}
          item={item}
          services={props.services}
          inventoryId={props.inventoryId}
          signal={props.signal}
          sync={props.sync}
        />
      ))}
    </section>
  );
}
