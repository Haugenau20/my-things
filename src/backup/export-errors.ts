const messages = {
  unfinished_operations:
    'Resolve unfinished captures, photo operations, and deletions before exporting.',
  unfinished_restore: 'Finish the interrupted restore before exporting a full backup.',
  missing_reference: 'A missing room or box reference blocks a complete export.',
  duplicate_records: 'Duplicate record IDs block export.',
  record_limit: 'Export exceeds the tested record limit.',
  metadata_limit: 'Export metadata exceeds the tested memory limit.',
  archive_limit: 'Export exceeds the tested ZIP output limit.',
  photo_limit: 'A photo exceeds the tested ZIP part limit.',
  photo_unverified:
    'A photo could not be read and verified. Missing or changed photo bytes block a complete export. Check your connection and stored photos, then retry.',
  inventory_changed: 'Inventory changed during export. No complete backup was finalized.',
  authentication_required: 'Owner authentication is required for export.',
} as const;

export type ExportErrorCode = keyof typeof messages;

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode) {
    super(messages[code]);
    this.name = 'ExportError';
    this.code = code;
  }
}

export function exportErrorMessage(failure: unknown, canceled: boolean): string {
  if (canceled)
    return 'Export canceled. Any saved parts are incomplete unless the final ZIP and every listed part were saved.';
  if (failure instanceof ExportError && Object.hasOwn(messages, failure.code))
    return messages[failure.code];
  return 'Export could not finish. No complete backup was confirmed. Resolve unfinished operations, check your connection and stored photos, then retry.';
}
