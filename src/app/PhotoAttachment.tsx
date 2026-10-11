import { PhotoDiagnostics } from './PhotoDiagnostics';
import { useMutationState } from './mutation-activity';
import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Item } from '../domain/item';
import { MAX_PHOTOS } from '../domain/item';
import type { PreparedPhoto } from '../media/processing';
import { preparePhoto } from '../media/processing';
import { attachFirstPhotos } from '../media/capture';
import { PhotoInputs } from './PhotoInputs';
import { captureFailureDetail } from '../media/capture-errors';

export function PhotoAttachment({
  item,
  services,
  inventoryId,
  signal: sessionSignal,
  onSaved,
  onAttempt,
}: {
  item: Item;
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  onSaved: () => Promise<void>;
  onAttempt: (id: string) => Promise<void>;
}) {
  const [controller] = useState(() => new AbortController());
  const signal = controller.signal;
  useEffect(() => {
    const abort = () => controller.abort();
    if (sessionSignal.aborted) abort();
    else sessionSignal.addEventListener('abort', abort, { once: true });
    return () => {
      sessionSignal.removeEventListener('abort', abort);
      controller.abort();
    };
  }, [sessionSignal, controller]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useMutationState();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string>();
  const [diagnosticFailure, setDiagnosticFailure] = useState<unknown>();
  const [status, setStatus] = useState('');
  const attempt = useRef<{ item: Item; prepared: PreparedPhoto[] } | undefined>(undefined);
  function select(selected: File[], append: boolean) {
    const next = append ? [...files, ...selected] : selected;
    setFiles(next);
    setStatus('');
    setError(next.length > MAX_PHOTOS ? 'Choose at most two photos.' : undefined);
  }
  async function save() {
    let acknowledged = false;
    setError(undefined);
    setDiagnosticFailure(undefined);
    if (!files.length || files.length > MAX_PHOTOS) {
      setError('Choose one or two photos to attach.');
      return;
    }
    setBusy(true);
    try {
      if (!attempt.current) {
        const prepared: PreparedPhoto[] = [];
        for (const file of files) {
          setStatus('Preparing optimized photos…');
          prepared.push(
            await preparePhoto(file, inventoryId, item.id, crypto.randomUUID(), signal),
          );
        }
        signal.throwIfAborted();
        attempt.current = { item, prepared };
        setLocked(true);
      }
      await attachFirstPhotos(
        services,
        inventoryId,
        attempt.current.item,
        attempt.current.prepared,
        signal,
        (text) => {
          if (!signal.aborted) setStatus(text);
        },
      );
      signal.throwIfAborted();
      acknowledged = true;
      attempt.current = undefined;
      setLocked(false);
      setFiles([]);
      setStatus('Photos saved.');
      await onSaved();
    } catch (failure) {
      if (!signal.aborted) {
        setDiagnosticFailure(acknowledged ? undefined : failure);
        if (!acknowledged) setStatus('');
        setError(
          acknowledged
            ? 'Photo attachment finished, but the inventory could not refresh. Reload to see the saved photos.'
            : attempt.current
              ? `${captureFailureDetail(failure)} Photo upload is unfinished. Your item remains saved. Retry these photos, or return to the gallery to recover or cancel the attachment.`.trim()
              : failure instanceof Error
                ? failure.message
                : 'Could not prepare these photos.',
        );
        if (attempt.current) await onAttempt(item.id);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="photo-attachment" aria-label="Add photos">
      <h3>Add photos to this thing</h3>
      <PhotoInputs onSelect={select} disabled={busy || locked} />
      <p className="supporting">
        Up to two photos · {files.length} selected. Your item stays saved while photos upload.
      </p>
      {files.length > 0 && (
        <ul className="selected-files">
          {files.map((file, index) => (
            <li key={index}>{file.name}</li>
          ))}
        </ul>
      )}
      {!locked && files.length > 0 && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setFiles([]);
            setError(undefined);
            setDiagnosticFailure(undefined);
            setStatus('');
          }}
        >
          Clear selected photos
        </button>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? 'Saving photos…' : locked ? 'Retry photo upload' : 'Save photos'}
      </button>
      {status && <p role="status">{status}</p>}
      {error && <PhotoDiagnostics failure={diagnosticFailure} />}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
