import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { WebhookDeliveryEntity } from '../entities';
import { BaseRepository } from './base';
import type { ConstraintViolationError } from './base';

import type {
  WebhookDelivery,
  WebhookDeliveryRepository,
} from '../../../domain';

@Injectable()
export class WebhookDeliveryRepositoryImplementation
  extends BaseRepository<WebhookDeliveryEntity>
  implements WebhookDeliveryRepository
{
  public constructor(dataSource: DataSource) {
    super(WebhookDeliveryEntity, dataSource.createEntityManager());
  }

  public async insertOne(
    delivery: Omit<WebhookDelivery, 'id'>,
  ): Promise<WebhookDelivery> {
    const result = await this.manager
      .createQueryBuilder()
      .insert()
      .into(WebhookDeliveryEntity)
      .values(delivery)
      .returning('*')
      .execute()
      .catch((error: unknown) => this.handleError(error));

    return this.restoreSingleFromRaw(result);
  }

  protected override processConstraintViolationError(
    error: ConstraintViolationError,
  ): never {
    throw error;
  }
}
