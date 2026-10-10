import type { AppConfig } from '../src/data/config.ts';
import { assertDeployment } from './safety.ts';
import { createHash } from 'node:crypto';

export function configFingerprint(config: AppConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function releaseSettings(config: AppConfig, manifest: unknown, fingerprint: string) {
  if (fingerprint !== configFingerprint(config))
    throw new Error(
      'Production configuration changed since the build. Rebuild before preparing the release.',
    );
  if (config.environment !== 'production' || config.emulators !== null)
    throw new Error('Release preparation requires explicit production configuration.');
  assertDeployment(manifest, {
    environment: config.environment,
    projectId: config.firebase.projectId,
    inventoryId: config.inventoryId,
  });
  if (config.firebase.authDomain !== `${config.firebase.projectId}.firebaseapp.com`)
    throw new Error('This release supports the reviewed Firebase Hosting auth origin only.');
  const origin = `https://${config.firebase.authDomain}`;
  return {
    csp: [
      "default-src 'self'",
      "script-src 'self' https://apis.google.com",
      "style-src 'self'",
      "img-src 'self' blob:",
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://firebasestorage.googleapis.com",
      "frame-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self'",
    ].join('; '),
    cors: [
      {
        origin: [origin],
        method: ['GET', 'HEAD'],
        responseHeader: ['Content-Type', 'Content-Length', 'Content-Disposition'],
        maxAgeSeconds: 3600,
      },
    ],
  };
}
