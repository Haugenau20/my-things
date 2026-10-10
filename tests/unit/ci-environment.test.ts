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
