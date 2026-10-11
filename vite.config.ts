import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnvironment } from './scripts/environment.mjs';

export default defineConfig(async ({ mode }): Promise<UserConfig> => {
  const environment = mode === 'emulator' ? 'local' : mode;
  const { env } = await loadEnvironment(environment);
  const browserEnv = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('VITE_')),
  );
  return {
    plugins: [react()],
    envDir: false,
    define: {
      __APP_ENV__: JSON.stringify(browserEnv),
      __APP_BUILD_VERSION__: JSON.stringify(
        environment === 'local' ? 'local' : (process.env.GITHUB_SHA ?? 'unknown'),
      ),
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  };
});
