import { Injectable } from '@nestjs/common';

import { HealthRepository } from './health.repository';
import type { HealthService } from './health.types';

@Injectable()
export class HealthServiceImplementation implements HealthService {
  public constructor(private readonly repository: HealthRepository) {}

  public async check(): Promise<void> {
    await this.repository.ping();
  }
}
