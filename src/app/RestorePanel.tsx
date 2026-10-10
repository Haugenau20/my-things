import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import type { Environment } from '../data/config';
import { validateArchive } from '../backup/validation';
import type { ValidatedArchive } from '../backup/validation';
import { inspectRestoreDestination, restoreArchive } from '../backup/restore';
import { abandonUnusedRestore, loadRestoreReport } from '../backup/restore-repository';
import type { RestoreReport } from '../backup/restore-state';
import type { Item } from '../domain/item';
import { destinationItem } from '../backup/restore-repository';
import type { PhotoSession } from '../media/photo-session';
import { PrivatePhoto } from './PrivatePhoto';

export function RestorePanel({
  services,
  inventoryId,
  environment,
  signal,
  disabled,
  pause,
  reload,
  session,
}: {
  services: FirebaseServices;
  inventoryId: string;
  environment: Environment;
  signal: AbortSignal;
  disabled: boolean;
  pause: (value: boolean) => void;
  reload: () => Promise<void>;
  session: PhotoSession;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [destination, setDestination] = useState(inventoryId);
  const [archive, setArchive] = useState<ValidatedArchive>();
  const [report, setReport] = useState<RestoreReport | null>();
  const [eligible, setEligible] = useState(false);
  const [settings, setSettings] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Item[]>([]);
  const [previewId, setPreviewId] = useState('');
  const active = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      active.current?.abort();
    },
    [],
  );
  function reset() {
    setArchive(undefined);
    setReport(undefined);
    setEligible(false);
    setConfirmed(false);
    setMessage('');
    setError('');
    setPreview([]);
    setPreviewId('');
  }
  async function run(action: (controller: AbortController) => Promise<void>) {
    if (busy || disabled) return;
    const controller = new AbortController();
    active.current = controller;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    setBusy(true);
    pause(true);
    setError('');
    try {
      await action(controller);
    } catch (failure) {
      if (!signal.aborted) {
        setMessage('');
        setEligible(false);
        setConfirmed(false);
        setError(
          controller.signal.aborted
            ? 'Stopped. Any submitted import writes may still exist. Refresh and validate the same archive to resume.'
            : failure instanceof Error
              ? failure.message
              : 'Restore could not finish. Existing data is preserved.',
        );
      }
    } finally {
      signal.removeEventListener('abort', abort);
      active.current = undefined;
      setBusy(false);
      await reload();
      pause(false);
    }
  }
  async function validate() {
    reset();
    await run(async (controller) => {
      const result = await validateArchive(files, controller.signal, setMessage);
      setArchive(result);
      setMessage('Checking destination…');
      setReport(await loadRestoreReport(services.db, destination));
      const target = await inspectRestoreDestination(
        services,
        destination,
        result,
        controller.signal,
      );
      controller.signal.throwIfAborted();
      setReport(target.report);
      setEligible(true);
      setMessage(
        target.report
          ? `Recovery report: ${target.report.state} · ${target.report.completedRecords} records verified. Select this same archive whenever recovery is needed.`
          : 'Archive validated and destination is empty. No writes have occurred.',
      );
    });
  }
  async function start() {
    if (!archive || !eligible || !confirmed) return;
    await run(async (controller) => {
      await restoreArchive(services, destination, archive, settings, controller.signal, setMessage);
      controller.signal.throwIfAborted();
      const verified = archive.snapshot.items
        .filter((item) => item.photos.length)
        .map((item) => destinationItem(item, destination));
      setPreview(verified);
      setPreviewId(verified[0]?.id ?? '');
      setEligible(false);
      setConfirmed(false);
    });
  }
  return (
    <div className="export-panel" role="region" aria-label="Backup restore">
      <p>
        Validate every ZIP part before restoring into an already-authorized empty inventory.
        Existing records and photos are preserved. An interrupted import must resume from its
        original archive.
      </p>
      <p>
        <strong>
          Destination environment:{' '}
          {environment === 'local' ? 'Local emulators · synthetic data' : environment}
        </strong>
      </p>
      <fieldset disabled={busy || disabled}>
        <label>
          Backup ZIP files
          <input
            type="file"
            accept=".zip,application/zip"
            multiple
            onChange={(event) => {
              reset();
              setFiles(Array.from(event.target.files ?? []));
            }}
          />
        </label>
        <label>
          Destination inventory ID
          <input
            value={destination}
            maxLength={128}
            onChange={(event) => {
              reset();
              setDestination(event.target.value);
            }}
          />
        </label>
        <p>
          The destination owner must already be configured by the project administrator. The backup
          cannot grant ownership.
        </p>
        <button
          type="button"
          className="secondary-button"
          disabled={!files.length || !destination}
          onClick={() => void validate()}
        >
          Validate backup and destination
        </button>
        {archive && (
          <div>
            <p>
              {archive.manifest.counts.items} items · {archive.manifest.counts.rooms} rooms ·{' '}
              {archive.manifest.counts.boxes} boxes · {archive.manifest.counts.photos} photos.
              Includes {archive.snapshot.items.filter((item) => item.deletedAt !== null).length}{' '}
              items in trash.
            </p>
            <p>
              Source inventory: {archive.snapshot.inventoryId}. IDs, room tags, packing boxes,
              quantities, values and historical timestamps will be preserved. Destination revision
              counters restart and update times record the import.
            </p>
            {eligible && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={settings}
                    onChange={(event) => setSettings(event.target.checked)}
                  />{' '}
                  Also restore inventory name and default currency
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{' '}
                  I confirm restore into {destination} in {environment}.
                </label>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!confirmed}
                  onClick={() => void start()}
                >
                  {report?.state === 'completed'
                    ? 'Verify completed restore'
                    : report
                      ? 'Resume restore'
                      : 'Restore validated backup'}
                </button>
              </>
            )}
            {report?.state === 'interrupted' && report.claimedRecords === 0 && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void run(async () => {
                    await abandonUnusedRestore(services.db, destination, report);
                    reset();
                    setMessage(
                      'Unused import lock released. No inventory records or photos were removed.',
                    );
                  })
                }
              >
                Release unused import lock
              </button>
            )}
          </div>
        )}
      </fieldset>
      {busy && (
        <button type="button" className="text-button" onClick={() => active.current?.abort()}>
          Stop restore work
        </button>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {preview.length > 0 && (
        <section aria-label="Restored photo preview">
          <h3>Check restored photos</h3>
          <p>
            These images are read privately from the restored destination. Choose an item to check
            image readability.
          </p>
          <label>
            Restored item photo preview
            <select value={previewId} onChange={(event) => setPreviewId(event.target.value)}>
              {preview.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.deletedAt ? ' · in trash' : ''}
                </option>
              ))}
            </select>
          </label>
          {preview
            .filter((item) => item.id === previewId)
            .map((item) => (
              <div key={item.id}>
                <p>
                  {item.name} · quantity {item.quantity}
                  {item.serialNumber ? ` · serial ${item.serialNumber}` : ''}
                </p>
                <div className="detail-photos">
                  {item.photos.map((photo, index) => (
                    <PrivatePhoto
                      key={photo.id}
                      file={photo.detail}
                      session={session}
                      detail
                      alt={`${item.name} · restored photo ${index + 1}`}
                    />
                  ))}
                </div>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
