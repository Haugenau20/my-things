import type { AppConfig } from '../src/data/config';
export function loadEnvironment(environment: string): Promise<{
  env: Record<string, string>;
  config: AppConfig;
}>;
