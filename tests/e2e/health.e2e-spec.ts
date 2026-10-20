import request from 'supertest';

import { ServiceUnavailableException } from '@core/exceptions';

import {
  type E2eContext,
  resetDatabase,
  startE2eContext,
  stopE2eContext,
} from './e2e-context';

describe('Health (e2e)', () => {
  let context: E2eContext | undefined;

  beforeAll(async () => {
    context = await startE2eContext();
    await resetDatabase(context.dataSource);
  }, 120_000);

  afterAll(async () => {
    if (context !== undefined) {
      await stopE2eContext(context);
    }
  });

  it('returns the exact healthy response when PostgreSQL answers', async () => {
    if (context === undefined) {
      throw new Error('The e2e context was not initialized');
    }

    await request(context.app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('returns 503 and code 5000 after the database connection is destroyed', async () => {
    if (context === undefined) {
      throw new Error('The e2e context was not initialized');
    }

    await context.dataSource.destroy();

    await request(context.app.getHttpServer())
      .get('/health')
      .expect(503)
      .expect({
        statusCode: 503,
        code: 5000,
        message: ServiceUnavailableException.Message.DATABASE_UNAVAILABLE,
      });
  });
});
