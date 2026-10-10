import { loadEnvironment } from './environment.mjs';
import { seedLocal } from './seed.ts';

const { config } = await loadEnvironment('local');
await seedLocal(config);
console.log('Synthetic users and owner policy seeded in demo-inventory only.');
