import { useEffect, useRef, useState } from 'react';
import type { FirebaseServices } from '../data/firebase';
import { inspectOrphans } from '../media/orphan-inspection';
import type { OrphanInspection as InspectionResult } from '../media/orphan-inspection';

export function OrphanInspection({
  services,
  inventoryId,
  signal,
}: {
  services: FirebaseServices;
  inventoryId: string;
  signal: AbortSignal;
}) {
  const current = useRef<AbortController | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<InspectionResult>();
  useEffect(() => () => current.current?.abort(), []);
  async function inspect() {
    const controller = new AbortController();
    current.current = controller;
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    setBusy(true);
    setCount(0);
    setError('');
    setResult(undefined);
    try {
      const preview = await inspectOrphans(services, inventoryId, controller.signal, (value) => {
        if (!controller.signal.aborted) setCount(value);
      });
      if (!signal.aborted && !controller.signal.aborted) setResult(preview);
    } catch (failure) {
      if (!signal.aborted)
        setError(
          controller.signal.aborted
            ? 'Inspection canceled; no complete preview was produced.'
            : failure instanceof Error &&
                failure.message ===
                  'Inventory changed during inspection. Refresh and run the preview again.'
              ? failure.message
              : 'Inspection could not finish. Check your connection and refresh before retrying; no complete preview was produced.',
        );
    } finally {
      signal.removeEventListener('abort', abort);
      current.current = undefined;
      if (!signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="orphan-inspection" aria-label="Orphan inspection">
      <h2>Stored photo inspection</h2>
      <p className="supporting">
        Preview only. All item states count as references. Unreferenced objects younger than 24
        hours are skipped. Unexpected paths need administrative review. Photo bytes are not
        downloaded.
      </p>
      <div className="save-actions">
        <button className="secondary-button" disabled={busy} onClick={() => void inspect()}>
          Inspect stored photos
        </button>
        {busy && (
          <button className="text-button" onClick={() => current.current?.abort()}>
            Cancel inspection
          </button>
        )}
      </div>
      {busy && <p role="status">Inspecting stored objects · {count} checked…</p>}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status">
            Inspection complete · {result.inspected} objects checked. No objects were deleted.
          </p>
          <p>
            {result.referenced} referenced · {result.recent} recent ·{' '}
            {result.findings.filter((value) => value.kind === 'candidate').length} old unreferenced
            · {result.findings.filter((value) => value.kind === 'unexpected').length} unexpected ·{' '}
            {result.missingDuringScan} disappeared during scan
          </p>
          {!!result.findings.length && (
            <ul className="inspection-findings">
              {result.findings.map((value) => (
                <li key={value.path}>
                  <strong>
                    {value.kind === 'candidate'
                      ? 'Old unreferenced object'
                      : 'Administrative review needed'}
                  </strong>
                  <br />
                  <code>{value.path}</code>
                  {value.byteSize !== null && <span> · {value.byteSize} bytes</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="supporting">
            This is a preview, not a backup or an atomic snapshot. Refresh the preview before any
            separately authorized maintenance. Referenced files were not checked for byte integrity.
          </p>
        </>
      )}
    </section>
  );
}
