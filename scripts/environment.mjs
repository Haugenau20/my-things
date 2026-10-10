import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { validateConfig } from '../src/data/config.ts';
import { assertBuildTarget } from './safety.ts';

export async function loadEnvironment(environment) {
  const file = environment === 'local' ? '.env.local' : `.env.${environment}.local`;
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch {
    throw new Error(`Create ${file} with explicit ${environment} configuration before starting`);
  }
  const env = { ...parseEnv(contents) };
  for (const [key, value] of Object.entries(process.env)) {
    if ((key.startsWith('VITE_') || key.startsWith('APP_')) && value !== undefined)
      env[key] = value;
  }
  const config = validateConfig(env);
  assertBuildTarget(config, environment, env);
  return { env, config };
}
