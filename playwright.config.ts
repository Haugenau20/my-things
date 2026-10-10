import { defineConfig, devices } from '@playwright/test';
import { assertLocalTarget } from './scripts/safety';

assertLocalTarget('demo-inventory', process.env);
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  maxFailures: 1,
  timeout: 15000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
