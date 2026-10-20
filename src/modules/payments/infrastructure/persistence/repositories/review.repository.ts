import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';

import { ResolvedBy } from '../../../domain/shared/payment-enums';
import {
  PaymentAttemptEntity,
  ProviderEventEntity,
  ReviewRequestEntity,
} from '../entities';
import { DatabaseException } from '@core/exceptions';
import { BaseRepository } from './base';
import type { ConstraintViolationError } from './base';

import type {
  NewReview,
  PaymentLock,
  Review,
  ReviewRepository,
} from '../../../domain';
import { SYSTEM_RESOLVED_REASONS } from '../../../domain/attempt/attempt-transition.policy';
import { PaymentTransaction } from '../payment-transaction';

@Injectable()
export class ReviewRepositoryImplementation
  extends BaseRepository<ReviewRequestEntity>
  implements ReviewRepository
{
  public constructor(dataSource: DataSource) {
    super(ReviewRequestEntity, dataSource.createEntityManager());
  }

  public async hasOpen(lock: PaymentLock): Promise<boolean> {
    const manager = PaymentTransaction.managerOf(lock);

    return manager.existsBy(ReviewRequestEntity, {
      paymentId: lock.payment.id,
      resolvedAt: IsNull(),
    });
  }

  public async insertOne(
    review: NewReview,
    lock: PaymentLock,
  ): Promise<Review | null> {
    const manager = PaymentTransaction.managerOf(lock);
    const belongs = await manager.existsBy(PaymentAttemptEntity, {
      id: review.attemptId,
      paymentId: lock.payment.id,
    });

    const eventBelongs =
      review.providerEventId === null ||
      (await manager.existsBy(ProviderEventEntity, {
        id: review.providerEventId,
        paymentId: lock.payment.id,
      }));

    if (!belongs || !eventBelongs) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_NOT_IN_LOCKED_PAYMENT,
      );
    }

    const [, columns, { where }] =
      ReviewRequestEntity.INDEX__UNIQUE__OPEN_PER_ATTEMPT_REASON;

    return this.insertOrIgnore(
      manager,
      { ...review, paymentId: lock.payment.id },
      { columns, where },
    );
  }

  public async updateSystemResolved(
    attemptId: string,
    resolvedAt: Date,
    lock: PaymentLock,
  ): Promise<void> {
    const manager = PaymentTransaction.managerOf(lock);
    // ADR 0005: resolved by SYSTEM when a clear result arrives.
    await manager
      .createQueryBuilder()
      .update(ReviewRequestEntity)
      .set({
        resolvedAt,
        resolvedBy: ResolvedBy.SYSTEM,
        updatedAt: () => 'now()',
      })
      .where(
        'attempt_id = :attemptId AND payment_id = :paymentId AND resolved_at IS NULL',
        { attemptId, paymentId: lock.payment.id },
      )
      .andWhere('reason IN (:...reasons)', { reasons: SYSTEM_RESOLVED_REASONS })
      .execute();
  }

  protected override processConstraintViolationError(
    error: ConstraintViolationError,
  ): never {
    throw error;
  }
}
