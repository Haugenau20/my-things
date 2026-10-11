import { appendFile, copyFile, writeFile } from 'node:fs/promises';
import { productionEnvironment } from './ci-environment.ts';

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !['local', 'production'].includes(mode))
  throw new Error('Choose local or production CI configuration.');
if (mode === 'local') {
  await copyFile('.env.example', '.env.local');
} else {
  let env;
  try {
    env = productionEnvironment(
      process.env.FIREBASE_WEB_CONFIG ?? '',
      process.env.APP_PRODUCTION_PROJECT_ID ?? '',
    );
  } catch {
    // Validation libraries can include input values; keep configuration out of CI error logs.
    throw new Error(
      'Set FIREBASE_WEB_CONFIG to valid public SDK JSON matching the production project.',
    );
  }
  await writeFile(
    '.env.production.local',
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `origin=https://${env.VITE_FIREBASE_AUTH_DOMAIN}\n`,
    );
  }
}
console.log(`Prepared explicit ${mode} configuration. No cloud action performed.`);
