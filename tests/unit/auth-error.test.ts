import { describe, expect, it } from 'vitest';
import { googleSignInError } from '../../src/data/auth-error';

describe('Google sign-in error messages', () => {
  it.each(['auth/admin-restricted-operation', 'auth/user-disabled'])(
    'explains rejected sign-in for %s without exposing provider details',
    (code) => {
      const error = { code, message: 'Private provider information' };
      expect(googleSignInError(error, 'start')).toBe(
        'Sign-in is restricted to the inventory owner.',
      );
      expect(googleSignInError(error, 'finish')).toBe(
        'Sign-in is restricted to the inventory owner.',
      );
    },
  );

  it.each([null, undefined, 'private details', { code: 'auth/network-request-failed' }])(
    'keeps unexpected failures generic: %j',
    (error) => {
      expect(googleSignInError(error, 'start')).toBe(
        'Could not start Google sign-in. Check your connection and authorized domain.',
      );
      expect(googleSignInError(error, 'finish')).toBe(
        'Google sign-in could not finish. Check your connection and try again.',
      );
    },
  );
});
