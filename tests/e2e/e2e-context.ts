import { randomBytes } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../../src/modules/payments/infrastructure/persistence/database/data-source-options';
import { MIGRATION_OPTIONS } from '../../src/modules/payments/infrastructure/persistence/database/migrations.glob';
import { InternalApplicationException } from '@core/exceptions';

import { configureApp } from '../../src/app.factory';
import { AppModule } from '../../src/app.module';
import {
  HTTP_CLIENT,
  type HttpClient,
} from '../../src/modules/payments/infrastructure/connectors/http-client';

export type E2eContext = {
  app: NestExpressApplication;
  dataSource: DataSource;
  container: StartedPostgreSqlContainer | null;
};

type ProvisionedDatabase = {
  connectionUri: string;
  container: StartedPostgreSqlContainer | null;
};

type StartedApplication = Pick<E2eContext, 'app' | 'dataSource'>;

/** Replace the provider transport; nothing else is faked. */
export type E2eOverrides = {
  httpClient?: HttpClient;
};

/** Test fixtures only: no real provider credentials or hosts. */
export const TEST_PROVIDER_ENV = {
  ALPHA_BASE_URL: 'https://alpha.test',
  ALPHA_API_KEY: 'test-alpha-key',
  ALPHA_WEBHOOK_SECRET: 'test-alpha-secret',
  BRAVO_BASE_URL: 'https://bravo.test',
  BRAVO_WEBHOOK_SECRET: 'test-bravo-secret',
  WORKERS_ENABLED: 'false',
} as const;

function configureDatabaseEnvironment(connectionUri: string): void {
  const url = new URL(connectionUri);
  const database = url.pathname.slice(1);

  process.env.DB_HOST = url.hostname;
  process.env.DB_PORT = url.port;
  process.env.DB_USER = decodeURIComponent(url.username);
  process.env.DB_PASSWORD = decodeURIComponent(url.password);
  process.env.DB_NAME = database;
  Object.assign(process.env, TEST_PROVIDER_ENV);
}

async function provisionDatabase(): Promise<ProvisionedDatabase> {
  const externalDatabaseUrl = process.env.TEST_DATABASE_URL;
  const container: StartedPostgreSqlContainer | null = externalDatabaseUrl
    ? null
    : await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('connector_kernel_test')
        .withUsername('connector_kernel_test')
        .withPassword(randomBytes(18).toString('base64url'))
        .start();
  const connectionUri = externalDatabaseUrl ?? container?.getConnectionUri();

  if (connectionUri === undefined) {
    throw new InternalApplicationException(
      'The e2e database connection URI is unavailable',
    );
  }

  return { connectionUri, container };
}

async function runMigrations(): Promise<void> {
  const migrator = new DataSource({
    ...buildDataSourceOptions(),
    ...MIGRATION_OPTIONS,
  });

  await migrator.initialize();

  try {
    await migrator.runMigrations();
  } finally {
    await migrator.destroy();
  }
}

async function startApplication(
  overrides: E2eOverrides,
): Promise<StartedApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });

  if (overrides.httpClient !== undefined) {
    builder = builder
      .overrideProvider(HTTP_CLIENT)
      .useValue(overrides.httpClient);
  }

  const moduleFixture: TestingModule = await builder.compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  configureApp(app);

  // Bind ONCE before any test runs: supertest calls `server.listen(0)` itself
  // when it finds no address, so concurrent `request(getHttpServer())` calls
  // race to bind and the losers surface as `read ECONNRESET`.
  await app.init();
  await app.listen(0);

  return { app, dataSource: app.get(DataSource) };
}

export async function startE2eContext(
  overrides: E2eOverrides = {},
): Promise<E2eContext> {
  const provisioned: ProvisionedDatabase = await provisionDatabase();
  configureDatabaseEnvironment(provisioned.connectionUri);
  await runMigrations();
  const application: StartedApplication = await startApplication(overrides);

  return { ...application, container: provisioned.container };
}

export async function resetDatabase(dataSource: DataSource): Promise<void> {
  const tables = dataSource.entityMetadatas.map(({ tablePath }) =>
    tablePath
      .split('.')
      .map((part) => `"${part.replaceAll('"', '""')}"`)
      .join('.'),
  );

  if (tables.length === 0) {
    return;
  }

  await dataSource.query(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export async function stopE2eContext(context: E2eContext): Promise<void> {
  await context.app.close();

  if (context.container !== null) {
    await context.container.stop();
  }
}
