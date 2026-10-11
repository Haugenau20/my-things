import { afterEach, expect, it, vi } from 'vitest';
import config from '../../vite.config';
vi.mock('../../scripts/environment.mjs', () => ({
  loadEnvironment: vi.fn(async () => ({ env: { VITE_APP_ENV: 'production' } })),
}));
afterEach(() => vi.unstubAllEnvs());
it('embeds the pipeline commit in a production build and identifies emulator builds as local', async () => {
  vi.stubEnv('GITHUB_SHA', 'b'.repeat(40));
  if (typeof config !== 'function') throw new Error('Expected Vite config function');
  expect(
    (await config({ command: 'build', mode: 'production' })).define?.__APP_BUILD_VERSION__,
  ).toBe(JSON.stringify('b'.repeat(40)));
  expect((await config({ command: 'build', mode: 'emulator' })).define?.__APP_BUILD_VERSION__).toBe(
    JSON.stringify('local'),
  );
});
it('does not invent a deployed revision outside the pipeline', async () => {
  vi.stubEnv('GITHUB_SHA', undefined);
  if (typeof config !== 'function') throw new Error('Expected Vite config function');
  expect(
    (await config({ command: 'build', mode: 'production' })).define?.__APP_BUILD_VERSION__,
  ).toBe(JSON.stringify('unknown'));
});
