import { useState } from 'react';
import { photoDiagnosticReport } from '../media/capture-errors';

export function PhotoDiagnostics({ failure }: { failure: unknown }) {
  const report = photoDiagnosticReport(failure, {
    version: __APP_BUILD_VERSION__,
    environment: __APP_ENV__.VITE_APP_ENV,
  });
  return report ? <DiagnosticCopy key={report} report={report} /> : null;
}

function DiagnosticCopy({ report }: { report: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle');
  async function copy() {
    setState('copying');
    try {
      await navigator.clipboard.writeText(report);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return (
    <div>
      <button
        type="button"
        className="text-button"
        disabled={state === 'copying'}
        onClick={() => void copy()}
      >
        Copy diagnostics
      </button>
      {state === 'copied' && <p role="status">Diagnostics copied.</p>}
      {state === 'failed' && (
        <>
          <p role="status">Clipboard unavailable. Select and copy the report below.</p>
          <textarea
            aria-label="Photo diagnostics report"
            readOnly
            value={report}
            rows={5}
            onFocus={(event) => event.currentTarget.select()}
          />
        </>
      )}
    </div>
  );
}
