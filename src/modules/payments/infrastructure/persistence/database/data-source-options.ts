import type { DataSourceOptions } from 'typeorm';

import * as Entities from '../entities';
import { requireEnvironment } from '@core/modules/config/require-environment';

const POOL_MAX = 10;

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: requireEnvironment(process.env, 'DB_HOST'),
    port: Number(requireEnvironment(process.env, 'DB_PORT')),
    username: requireEnvironment(process.env, 'DB_USER'),
    password: requireEnvironment(process.env, 'DB_PASSWORD'),
    database: requireEnvironment(process.env, 'DB_NAME'),
    synchronize: false,
    entities: [
      ...Object.values<(typeof Entities)[keyof typeof Entities]>(Entities),
    ],
    extra: { max: POOL_MAX },
  };
}
