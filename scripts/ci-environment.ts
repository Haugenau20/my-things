import { z } from 'zod';
import { validateConfig } from '../src/data/config.ts';
import { assertBuildTarget } from './safety.ts';
import { assertReviewedHostingDomain } from './hosting-domain.ts';

const webConfig = z.object({
  apiKey: z.string().regex(/^[A-Za-z0-9_-]+$/),
  authDomain: z.string().regex(/^[a-z0-9.-]+$/),
  projectId: z.string(),
  storageBucket: z.string().regex(/^[a-z0-9._-]+$/),
  appId: z.string().regex(/^1:\d+:web:[a-f0-9]+$/),
});

export function productionEnvironment(raw: string, projectId: string): Record<string, string> {
  const web = webConfig.parse(JSON.parse(raw));
  const env = {
    VITE_APP_ENV: 'production',
    VITE_USE_EMULATORS: 'false',
    VITE_INVENTORY_ID: 'main',
    APP_PRODUCTION_PROJECT_ID: projectId,
    VITE_FIREBASE_API_KEY: web.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: web.authDomain,
    VITE_FIREBASE_PROJECT_ID: web.projectId,
    VITE_FIREBASE_STORAGE_BUCKET: web.storageBucket,
    VITE_FIREBASE_APP_ID: web.appId,
  };
  assertBuildTarget(validateConfig(env), 'production', env);
  assertReviewedHostingDomain(projectId, web.authDomain);
  return env;
}
