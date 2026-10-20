import { Module } from '@nestjs/common';

import { HEALTH_SERVICE_PROVIDER } from './health.constants';
import { HealthController } from './health.controller';
import { HealthPresenter } from './health.presenter';
import { HealthRepository } from './health.repository';
import { HealthServiceImplementation } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [
    HealthPresenter,
    HealthRepository,
    {
      provide: HEALTH_SERVICE_PROVIDER,
      useClass: HealthServiceImplementation,
    },
  ],
})
export class HealthModule {}
