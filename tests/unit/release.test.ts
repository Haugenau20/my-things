import { describe, expect, it } from 'vitest';
import { releaseSettings, configFingerprint } from '../../scripts/release';
import type { AppConfig } from '../../src/data/config';

const config: AppConfig = {
  environment: 'production',
  inventoryId: 'main',
  emulators: null,
  firebase: {
    projectId: 'synthetic-project',
    authDomain: 'synthetic-project.firebaseapp.com',
    storageBucket: 'synthetic-project.firebasestorage.app',
    apiKey: 'synthetic-key',
    appId: 'synthetic-app',
  },
};
const manifest = { environment: 'production', projectId: 'synthetic-project', inventoryId: 'main' };
describe('validation-only cloud release settings', () => {
  it('uses exact auth and Storage origins without local services or wildcard access', () => {
    const settings = releaseSettings(config, manifest, configFingerprint(config));
    expect(settings.cors[0]?.origin).toEqual(['https://synthetic-project.firebaseapp.com']);
    expect(settings.csp).toContain('https://firebasestorage.googleapis.com');
    expect(settings.csp).toContain(
      "img-src 'self' blob: https://firebasestorage.googleapis.com/v0/b/synthetic-project.firebasestorage.app/o/",
    );
    expect(settings.csp).toContain("frame-src 'self'");
    expect(settings.csp).toContain('https://apis.google.com');
    expect(settings.csp).not.toMatch(/127\.0\.0\.1|localhost|unsafe-inline|unsafe-eval|\*/);
    expect(JSON.stringify(settings)).not.toContain('synthetic-key');
  });
  it('refuses local builds, mismatched cloud targets, and an unreviewed auth origin', () => {
    expect(() => releaseSettings(config, manifest, 'outdated-build-fingerprint')).toThrow();
    expect(() =>
      releaseSettings(config, { ...manifest, environment: 'local' }, configFingerprint(config)),
    ).toThrow();
    expect(() =>
      releaseSettings(
        config,
        { ...manifest, projectId: 'different-project' },
        configFingerprint(config),
      ),
    ).toThrow();
    expect(() =>
      releaseSettings({ ...config, environment: 'local' }, manifest, configFingerprint(config)),
    ).toThrow();
    expect(() =>
      releaseSettings(
        { ...config, firebase: { ...config.firebase, authDomain: 'unexpected.example' } },
        manifest,
        configFingerprint({
          ...config,
          firebase: { ...config.firebase, authDomain: 'unexpected.example' },
        }),
      ),
    ).toThrow();
  });
  it('prepares exact-origin custom-domain CORS while preserving same-origin auth frames', () => {
    const custom: AppConfig = {
      ...config,
      firebase: { ...config.firebase, authDomain: 'things.muninn.quest' },
    };
    const settings = releaseSettings(custom, manifest, configFingerprint(custom));
    expect(settings.cors[0]?.origin).toEqual(['https://things.muninn.quest']);
    expect(settings.cors[0]?.method).toEqual(['GET', 'HEAD']);
    expect(settings.csp).toBe(releaseSettings(config, manifest, configFingerprint(config)).csp);
    expect(settings.csp).toContain("frame-src 'self'");
    expect(settings.csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(() => releaseSettings(custom, manifest, configFingerprint(config))).toThrow();
    expect(() =>
      releaseSettings(
        custom,
        { ...manifest, projectId: 'different-project' },
        configFingerprint(custom),
      ),
    ).toThrow();
  });
  it.each(['muninn.quest', 'storage.muninn.quest', 'things.muninn.quest.example'])(
    'rejects unreviewed release origins even with a matching fingerprint: %s',
    (authDomain) => {
      const unreviewed: AppConfig = { ...config, firebase: { ...config.firebase, authDomain } };
      expect(() => releaseSettings(unreviewed, manifest, configFingerprint(unreviewed))).toThrow();
    },
  );
});
