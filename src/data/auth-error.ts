export function googleSignInError(error: unknown, stage: 'start' | 'finish'): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/user-disabled')
  ) {
    return 'Sign-in is restricted to the inventory owner.';
  }
  return stage === 'start'
    ? 'Could not start Google sign-in. Check your connection and authorized domain.'
    : 'Google sign-in could not finish. Check your connection and try again.';
}
