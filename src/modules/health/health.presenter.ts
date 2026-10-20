import { Inject, Injectable } from '@nestjs/common';

import { HealthResponseDto } from './dtos/health-response.dto';
import { HEALTH_SERVICE_PROVIDER } from './health.constants';
import { HealthStatus } from './health.types';
import type { HealthService } from './health.types';

@Injectable()
export class HealthPresenter {
  public constructor(
    @Inject(HEALTH_SERVICE_PROVIDER)
    private readonly healthService: HealthService,
  ) {}

  public async check(): Promise<HealthResponseDto> {
    await this.healthService.check();

    return new HealthResponseDto({ status: HealthStatus.OK });
  }
}
