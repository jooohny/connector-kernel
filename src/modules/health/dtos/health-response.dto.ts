import { Expose } from 'class-transformer';

import { BaseResponseDto } from '@core/presentation/base-response.dto';

import type { HealthStatus } from '../health.types';

export class HealthResponseDto extends BaseResponseDto<HealthResponseDto> {
  @Expose()
  public status: HealthStatus;
}
