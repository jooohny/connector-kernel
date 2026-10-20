import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from './data-source-options';
import { MIGRATION_OPTIONS } from './migrations.glob';

/** Used only by the TypeORM CLI for migrations (`npm run typeorm`, the image's migrate stage). */
export default new DataSource({
  ...buildDataSourceOptions(),
  ...MIGRATION_OPTIONS,
});
