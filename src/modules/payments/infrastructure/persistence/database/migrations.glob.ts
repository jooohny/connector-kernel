import { join } from 'node:path';

import type { DataSourceOptions } from 'typeorm';

/** cwd is the repo root for npm scripts and jest, and /app in the image. */
export const MIGRATIONS_GLOB = join(process.cwd(), 'migrations', '*.{ts,js}');

export const MIGRATION_OPTIONS = {
  migrations: [MIGRATIONS_GLOB],
  migrationsTransactionMode: 'each',
} satisfies Pick<DataSourceOptions, 'migrations' | 'migrationsTransactionMode'>;
