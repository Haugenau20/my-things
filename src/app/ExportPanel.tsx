import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import { createExport } from '../backup/export-repository';
import { exportErrorMessage } from '../backup/export-errors';

export function ExportPanel({
  services,
  inventoryId,
  signal,
  disabled,
  pause,
}: {
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
  disabled: boolean;
  pause: (value: boolean) => void;
}) {
  const active = useRef<AbortController | undefined>(undefined);
  const downloadUrl = useRef<string | undefined>(undefined);
  const acknowledge = useRef<(() => void) | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string[]>([]);
  const [part, setPart] = useState<{ name: string; url: string; final: boolean }>();
  const [downloadRequested, setDownloadRequested] = useState(false);
  function release() {
    if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    downloadUrl.current = undefined;
  }
  useEffect(
    () => () => {
      active.current?.abort();
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    },
    [],
  );
  async function start() {
    if (disabled || busy) return;
    const controller = new AbortController();
    active.current = controller;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pause(true);
    setBusy(true);
    setStatus('Preparing export…');
    setError('');
    setSaved([]);
    const savedNames: string[] = [];
    try {
      for await (const next of createExport(services, inventoryId, controller.signal, (message) => {
        if (!controller.signal.aborted) setStatus(message);
      })) {
        controller.signal.throwIfAborted();
        release();
        const url = URL.createObjectURL(next.blob);
        downloadUrl.current = url;
        setPart({ name: next.name, url, final: next.final });
        setDownloadRequested(false);
        setStatus(
          next.final
            ? 'Final ZIP ready. Save it with every photo part before confirming.'
            : 'Photo part ready. Save it before continuing; these parts alone are incomplete.',
        );
        await new Promise<void>((resolve, reject) => {
          const stop = () => {
            acknowledge.current = undefined;
            reject(new Error('Export canceled.'));
          };
          controller.signal.addEventListener('abort', stop, { once: true });
          acknowledge.current = () => {
            controller.signal.removeEventListener('abort', stop);
            acknowledge.current = undefined;
            resolve();
          };
          if (controller.signal.aborted) stop();
        });
        controller.signal.throwIfAborted();
        savedNames.push(next.name);
        setSaved([...savedNames]);
        setPart(undefined);
        release();
      }
      controller.signal.throwIfAborted();
      setStatus(
        `Export complete · you confirmed saving ${savedNames.length} ZIP ${savedNames.length === 1 ? 'file' : 'files'}. Keep every part together. Restore has not yet been verified.`,
      );
    } catch (failure) {
      if (!signal.aborted) {
        setStatus('');
        setError(exportErrorMessage(failure, controller.signal.aborted));
      }
    } finally {
      signal.removeEventListener('abort', abort);
      acknowledge.current = undefined;
      active.current = undefined;
      release();
      if (!signal.aborted) {
        setPart(undefined);
        setBusy(false);
        pause(false);
      }
    }
  }
  return (
    <section className="export-panel" aria-label="Full export">
      <h2>Export your inventory</h2>
      <p>
        Download records, a readable CSV, and verified photo files. Exports contain unencrypted
        personal data. Keep a copy outside Firebase and this repository.
      </p>
      <p className="supporting">
        Wait for current saves to finish. This tab pauses editing during export; avoid edits in
        other tabs or devices. Large exports use numbered photo ZIPs and a final metadata ZIP. Save
        every part. The browser cannot verify where downloads were saved.
      </p>
      <div className="save-actions">
        <button
          className="secondary-button"
          disabled={disabled || busy}
          onClick={() => void start()}
        >
          Start full export
        </button>
        {busy && (
          <button className="text-button" onClick={() => active.current?.abort()}>
            Cancel export
          </button>
        )}
      </div>
      {disabled && !busy && (
        <p className="supporting">
          Finish current saves or recovery actions and refresh before exporting.
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {part && (
        <div className="export-download">
          <a href={part.url} download={part.name} onClick={() => setDownloadRequested(true)}>
            Download {part.name}
          </a>
          <button
            className="primary-button"
            disabled={!downloadRequested}
            onClick={() => acknowledge.current?.()}
          >
            {part.final
              ? 'I saved the final ZIP and every photo part'
              : 'I saved this photo part · continue'}
          </button>
        </div>
      )}
      {!!saved.length && (
        <details>
          <summary>
            {saved.length} ZIP {saved.length === 1 ? 'file' : 'files'} acknowledged
          </summary>
          <ul>
            {saved.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
