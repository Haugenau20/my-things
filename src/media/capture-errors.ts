const details: Readonly<Record<string, string>> = {
  'storage/unauthorized': 'Photo upload or verification was denied (storage/unauthorized).',
  'storage/unauthenticated': 'Sign in again before retrying (storage/unauthenticated).',
  'storage/retry-limit-exceeded': 'Photo transfer timed out (storage/retry-limit-exceeded).',
  'permission-denied': 'Item save was denied (permission-denied).',
  'photo/source-missing':
    'Some uploads are missing. Reselect the original photos to retry, or discard this unfinished capture.',
  'photo/source-mismatch':
    'Reselected photos do not match this attempt. Choose the original files or discard and start again.',
  unavailable: 'The save service is temporarily unavailable (unavailable).',
};

export function captureFailureDetail(failure: unknown): string {
  if (typeof failure !== 'object' || failure === null || !('code' in failure)) return '';
  if (typeof failure.code !== 'string') return '';
  // Only fixed messages may reach the form; SDK messages can contain object paths or URLs.
  return Object.hasOwn(details, failure.code) ? details[failure.code]! : '';
}

export type PhotoPhase = 'registration' | 'upload' | 'verification' | 'finalization';

export class PhotoOperationFailure extends Error {
  readonly phase: PhotoPhase;
  readonly code: string;
  constructor(phase: PhotoPhase, failure: unknown) {
    super(`Photo ${phase} could not be confirmed.`);
    this.name = 'PhotoOperationFailure';
    this.phase = phase;
    this.code =
      typeof failure === 'object' &&
      failure !== null &&
      'code' in failure &&
      typeof failure.code === 'string' &&
      Object.hasOwn(details, failure.code)
        ? failure.code
        : 'unknown';
  }
}

export async function photoPhase<T>(phase: PhotoPhase, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (failure) {
    // The innermost boundary is authoritative, including concurrent derivative transfers.
    throw failure instanceof PhotoOperationFailure
      ? failure
      : new PhotoOperationFailure(phase, failure);
  }
}

export function photoDiagnosticReport(
  failure: unknown,
  context: { version: unknown; environment: unknown },
): string | undefined {
  if (!(failure instanceof PhotoOperationFailure)) return undefined;
  const version =
    typeof context.version === 'string' && /^(?:[a-f0-9]{40}|local)$/.test(context.version)
      ? context.version
      : 'unknown';
  const environment =
    ['local', 'development', 'production'].find((value) => value === context.environment) ??
    'unknown';
  return `Photo operation diagnostics v1\nPhase: ${failure.phase}\nCode: ${failure.code}\nBuild: ${version}\nEnvironment: ${environment}`;
}
