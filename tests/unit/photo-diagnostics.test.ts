import { describe, expect, it } from 'vitest';
import {
  photoPhase,
  photoDiagnosticReport,
  PhotoOperationFailure,
} from '../../src/media/capture-errors';

const context = { version: 'a'.repeat(40), environment: 'local' };
describe('safe photo diagnostics', () => {
  it.each(['registration', 'upload', 'verification', 'finalization'] as const)(
    'records the failing %s boundary without retaining private SDK details',
    async (phase) => {
      const failure = await photoPhase(phase, async () => {
        throw {
          code: 'storage/unauthorized',
          message: 'private name inventories/main/items/private?token=secret',
          customData: { token: 'secret' },
        };
      }).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(PhotoOperationFailure);
      expect(photoDiagnosticReport(failure, context)).toBe(
        `Photo operation diagnostics v1\nPhase: ${phase}\nCode: storage/unauthorized\nBuild: ${'a'.repeat(40)}\nEnvironment: local`,
      );
      expect(JSON.stringify(failure)).not.toMatch(/private|secret|token|inventories/);
    },
  );
  it('keeps the inner phase under an outer operation and allows a clean retry', async () => {
    const failure = await photoPhase('finalization', () =>
      photoPhase('verification', async () => {
        throw new Error('private');
      }),
    ).catch((error: unknown) => error);
    expect(photoDiagnosticReport(failure, context)).toContain('Phase: verification\nCode: unknown');
    expect(await photoPhase('finalization', async () => 'saved')).toBe('saved');
  });
  it('allowlists every report field and does not infer an untracked failure phase', () => {
    const failure = new PhotoOperationFailure('upload', {
      code: 'private-code',
      message: 'private',
    });
    expect(
      photoDiagnosticReport(failure, {
        version: 'https://private?token=secret',
        environment: 'private-project',
      }),
    ).toBe(
      'Photo operation diagnostics v1\nPhase: upload\nCode: unknown\nBuild: unknown\nEnvironment: unknown',
    );
    expect(photoDiagnosticReport(new Error('private'), context)).toBeUndefined();
  });
});
