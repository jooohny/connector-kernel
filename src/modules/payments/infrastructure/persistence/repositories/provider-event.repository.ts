import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';

import { ProviderEventEntity, ReviewRequestEntity } from '../entities';
import { DatabaseException } from '@core/exceptions';
import { BaseRepository } from './base';
import type { ConstraintViolationError } from './base';

import type {
  NewEventReview,
  NewProviderEvent,
  PaymentLock,
  ProviderEvent,
  ProviderEventRepository,
  With,
} from '../../../domain';
import { PaymentTransaction } from '../payment-transaction';

@Injectable()
export class ProviderEventRepositoryImplementation
  extends BaseRepository<ProviderEventEntity>
  implements ProviderEventRepository
{
  public constructor(dataSource: DataSource) {
    super(ProviderEventEntity, dataSource.createEntityManager());
  }

  public async insertOneOrIgnore(
    event: NewProviderEvent,
    review: NewEventReview | null,
  ): Promise<ProviderEvent | null> {
    const [, columns] = ProviderEventEntity.UNIQUE__CONNECTOR_EVENT_ID;

    return this.manager
      .transaction(async (manager) => {
        const row = await this.insertOrIgnore(
          manager,
          {
            connector: event.connector,
            eventId: event.eventId,
            deliveryId: event.deliveryId,
            rawType: event.rawType,
            providerStatus: event.observation.status,
            failureCause: event.observation.cause,
            providerCode: event.observation.code,
            providerMessage: event.observation.message,
            attemptId: event.attemptId,
            paymentId: event.paymentId,
            payload: event.payload,
            receivedAt: event.receivedAt,
            result: event.result,
            processedAt: event.processedAt,
          },
          { columns },
        );

        if (row !== null && review !== null) {
          // ADR 0001: the one cross-table write keeps an unmatched event and its review atomic.
          await manager.insert(ReviewRequestEntity, {
            ...review,
            paymentId: null,
            attemptId: null,
            providerEventId: row.id,
          });
        }

        return row;
      })
      .catch((error: unknown) => this.handleError(error));
  }

  public async listPaymentIdsWithUnprocessed(
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await this.manager
      .createQueryBuilder(ProviderEventEntity, 'e')
      .select('e.payment_id', 'paymentId')
      .where('e.processed_at IS NULL AND e.payment_id IS NOT NULL')
      .groupBy('e.payment_id')
      .orderBy('MIN(e.received_at)', 'ASC')
      .limit(limit)
      .getRawMany<{ paymentId: string }>();

    return rows.map((row) => row.paymentId);
  }

  public async listUnprocessed(
    lock: PaymentLock,
  ): Promise<readonly With<ProviderEvent, 'attemptId'>[]> {
    const rows = await PaymentTransaction.managerOf(lock).find(
      ProviderEventEntity,
      {
        where: { paymentId: lock.payment.id, processedAt: IsNull() },
        order: { receivedAt: 'ASC', id: 'ASC' },
      },
    );

    // provider_events__payment_id__check rules a null attempt out; a row without one stops the flow.
    return rows.map(({ attemptId, ...row }) => {
      if (attemptId === null) {
        throw new DatabaseException(
          DatabaseException.Message.EVENT_WITHOUT_ATTEMPT,
        );
      }

      return { ...row, attemptId };
    });
  }

  public async updateProcessed(
    event: Pick<ProviderEvent, 'id' | 'result' | 'processedAt'>,
    lock: PaymentLock,
  ): Promise<void> {
    const manager = PaymentTransaction.managerOf(lock);
    const result = await manager
      .createQueryBuilder()
      .update(ProviderEventEntity)
      .set({ result: event.result, processedAt: event.processedAt })
      .where('id = :id AND payment_id = :paymentId AND processed_at IS NULL', {
        id: event.id,
        paymentId: lock.payment.id,
      })
      .execute();

    if (result.affected === 0) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_CHANGED_OUTSIDE_LOCK,
      );
    }
  }

  protected override processConstraintViolationError(
    error: ConstraintViolationError,
  ): never {
    throw error;
  }
}
