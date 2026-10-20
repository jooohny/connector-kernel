import { ConfigService } from '@core/modules/config';

import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(app.get(ConfigService).port);
}

void bootstrap();
