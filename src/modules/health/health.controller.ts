import { Controller, Get, UseFilters } from '@nestjs/common';

import { GlobalExceptionFilter } from '@core/exception-filters';

import type { HealthResponseDto } from './dtos/health-response.dto';
import { HealthPresenter } from './health.presenter';

@Controller('health')
@UseFilters(GlobalExceptionFilter)
export class HealthController {
  public constructor(private readonly healthPresenter: HealthPresenter) {}

  @Get()
  public async check(): Promise<HealthResponseDto> {
    return this.healthPresenter.check();
  }
}
