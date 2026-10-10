const details: Readonly<Record<string, string>> = {
  'storage/unauthorized': 'Photo upload or verification was denied (storage/unauthorized).',
  'storage/unauthenticated': 'Sign in again before retrying (storage/unauthenticated).',
  'storage/retry-limit-exceeded': 'Photo transfer timed out (storage/retry-limit-exceeded).',
  'permission-denied': 'Item save was denied (permission-denied).',
  unavailable: 'The save service is temporarily unavailable (unavailable).',
};

export function captureFailureDetail(failure: unknown): string {
  if (typeof failure !== 'object' || failure === null || !('code' in failure)) return '';
  if (typeof failure.code !== 'string') return '';
  // Only fixed messages may reach the form; SDK messages can contain object paths or URLs.
  return Object.hasOwn(details, failure.code) ? details[failure.code]! : '';
}
