import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';

import { exceptionFactory } from '@core/exceptions';

import { AppModule } from './app.module';

export function configureApp(
  app: NestExpressApplication,
): NestExpressApplication {
  // Webhooks keep their exact bytes whatever the content type, even when they are not JSON:
  // the signature covers the raw body, and an unparseable delivery is still recorded.
  // Registered before the default JSON parser, which then skips the consumed body.
  app.useBodyParser('raw', {
    limit: '64kb',
    type: (request: Request) => request.url.startsWith('/webhooks/'),
  });
  app.useBodyParser('json', { limit: '64kb' });
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory,
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector), {
      strategy: 'excludeAll',
    }),
  );

  return app;
}

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  return configureApp(app);
}
