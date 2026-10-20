import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ServiceUnavailableException } from '@core/exceptions';

// No entity is owned by health, so this repository does not extend BaseRepository.
@Injectable()
export class HealthRepository {
  public constructor(private readonly dataSource: DataSource) {}

  public async ping(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException(
        ServiceUnavailableException.Message.DATABASE_UNAVAILABLE,
      );
    }
  }
}
