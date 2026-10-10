// Public synthetic emulator fixtures, never an authorization source.
export const LOCAL_ACCOUNTS = {
  owner: {
    uid: 'synthetic-owner',
    email: 'owner@example.invalid',
    password: 'synthetic-local-only',
  },
  unrelated: {
    uid: 'synthetic-unrelated',
    email: 'unrelated@example.invalid',
    password: 'synthetic-local-only',
  },
};
