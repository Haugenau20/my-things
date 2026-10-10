import { expect, it } from 'vitest';
import { captureFailureDetail } from '../../src/media/capture-errors';

it('explains an upload denial without copying private SDK error text', () => {
  const result = captureFailureDetail({
    code: 'storage/unauthorized',
    message: 'private path and token',
  });
  expect(result).toContain('Photo upload or verification was denied (storage/unauthorized).');
  expect(result).not.toContain('private path');
  expect(result).not.toContain('token');
});
it('distinguishes a denied item write from a Storage failure', () => {
  expect(captureFailureDetail({ code: 'permission-denied' })).toContain(
    'Item save was denied (permission-denied).',
  );
});
it('does not render arbitrary error codes or SDK messages', () => {
  expect(captureFailureDetail({ code: 'private-data', message: 'private message' })).toBe('');
  expect(captureFailureDetail(new Error('private message'))).toBe('');
});
