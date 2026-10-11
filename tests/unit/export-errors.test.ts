import { describe, expect, it } from 'vitest';
import { ExportError, exportErrorMessage } from '../../src/backup/export-errors';
import type { ExportErrorCode } from '../../src/backup/export-errors';

const privateMessage =
  'Inventory changed during export inventories/private/items/private https://example.invalid/?token=private';
const fallback =
  'Export could not finish. No complete backup was confirmed. Resolve unfinished operations, check your connection and stored photos, then retry.';

describe('safe export error presentation', () => {
  it.each<ExportErrorCode>([
    'unfinished_operations',
    'unfinished_restore',
    'missing_reference',
    'duplicate_records',
    'record_limit',
    'metadata_limit',
    'archive_limit',
    'photo_limit',
    'photo_unverified',
    'inventory_changed',
    'authentication_required',
  ])('uses the %s category even when error wording changes', (code) => {
    const failure = new ExportError(code);
    const expected = failure.message;
    failure.message = privateMessage;
    expect(exportErrorMessage(failure, false)).toBe(expected);
    expect(exportErrorMessage(failure, false)).not.toContain('private');
  });

  it.each([
    new Error(privateMessage),
    { code: 'inventory_changed', message: privateMessage },
    privateMessage,
    null,
    undefined,
  ])('sanitizes unknown failures instead of recognizing familiar wording', (failure) => {
    expect(exportErrorMessage(failure, false)).toBe(fallback);
  });

  it('keeps cancellation and incomplete-part guidance ahead of any underlying error', () => {
    expect(exportErrorMessage(new ExportError('inventory_changed'), true)).toBe(
      'Export canceled. Any saved parts are incomplete unless the final ZIP and every listed part were saved.',
    );
    expect(exportErrorMessage(new Error(privateMessage), true)).not.toContain('private');
  });
});
