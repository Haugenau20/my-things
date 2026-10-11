import { expect, it } from 'vitest';
import { productionEnvironment } from '../../scripts/ci-environment';

const project = 'synthetic-production';
const web = {
  apiKey: 'synthetic-public-key',
  authDomain: `${project}.firebaseapp.com`,
  projectId: project,
  storageBucket: `${project}.firebasestorage.app`,
  appId: '1:123456:web:abcdef',
};

it('produces explicit production config from the public SDK JSON without forwarding extra fields', () => {
  const result = productionEnvironment(
    JSON.stringify({ ...web, measurementId: 'unused', private_key: 'never-forward' }),
    project,
  );
  expect(result).toMatchObject({
    VITE_APP_ENV: 'production',
    VITE_USE_EMULATORS: 'false',
    VITE_INVENTORY_ID: 'main',
    APP_PRODUCTION_PROJECT_ID: project,
    VITE_FIREBASE_PROJECT_ID: project,
  });
  expect(JSON.stringify(result)).not.toContain('never-forward');
  expect(result).not.toHaveProperty('VITE_FIREBASE_MEASUREMENT_ID');
});
it('rejects another project before creating production config', () => {
  expect(() => productionEnvironment(JSON.stringify(web), 'other-production')).toThrow();
});
it('accepts the owner-selected custom auth domain without changing the production target', () => {
  const result = productionEnvironment(
    JSON.stringify({ ...web, authDomain: 'things.muninn.quest' }),
    project,
  );
  expect(result.VITE_FIREBASE_AUTH_DOMAIN).toBe('things.muninn.quest');
  expect(result.VITE_FIREBASE_PROJECT_ID).toBe(project);
  expect(result.VITE_FIREBASE_STORAGE_BUCKET).toBe(web.storageBucket);
  expect(() =>
    productionEnvironment(
      JSON.stringify({ ...web, authDomain: 'things.muninn.quest' }),
      'other-production',
    ),
  ).toThrow();
});
it.each([
  'muninn.quest',
  'storage.muninn.quest',
  'other.muninn.quest',
  'things.muninn.quest.example',
  'another-project.firebaseapp.com',
])('rejects an unreviewed auth domain: %s', (authDomain) => {
  expect(() => productionEnvironment(JSON.stringify({ ...web, authDomain }), project)).toThrow();
});
it.each([
  '',
  '{}',
  '{invalid',
  JSON.stringify({ ...web, apiKey: 'key\nVITE_USE_EMULATORS=true' }),
  JSON.stringify({ ...web, projectId: 'demo-inventory' }),
  JSON.stringify({ ...web, authDomain: 'https://example.test' }),
])('fails closed for missing, malformed or injected Web configuration', (raw) => {
  expect(() => productionEnvironment(raw, project)).toThrow();
});
