import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  AttemptStatus,
  PaymentStatus,
  ReviewReason,
} from '../../../domain/shared/payment-enums';
import type { ConnectorName } from '../../../domain/shared/payment-enums';
import { PaymentAttemptEntity } from '../entities';
import { DatabaseException } from '@core/exceptions';
import { BaseRepository } from './base';
import type { ConstraintViolationError } from './base';

import type {
  Attempt,
  AttemptRepository,
  AttemptUpdate,
  NewAttempt,
  PaymentLock,
  With,
} from '../../../domain';
import { PaymentTransaction } from '../payment-transaction';

const UUID_REFERENCE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AttemptRepositoryImplementation
  extends BaseRepository<PaymentAttemptEntity>
  implements AttemptRepository
{
  public constructor(dataSource: DataSource) {
    super(PaymentAttemptEntity, dataSource.createEntityManager());
  }

  public async getByReference(
    connector: ConnectorName,
    reference: string | null,
  ): Promise<Attempt | null> {
    if (reference === null || !UUID_REFERENCE.test(reference)) {
      return null;
    }

    return this.manager.findOneBy(PaymentAttemptEntity, {
      id: reference,
      connector,
    });
  }

  public async listDue(
    now: Date,
    limit: number,
  ): Promise<readonly With<Attempt, 'payment'>[]> {
    const rows = await this.manager
      .createQueryBuilder(PaymentAttemptEntity, 'a')
      .innerJoinAndSelect('a.payment', 'p')
      .where('a.next_check_at <= :now AND a.status IN (:...statuses)', {
        now,
        statuses: [AttemptStatus.UNKNOWN, AttemptStatus.PENDING],
      })
      .orderBy('a.next_check_at', 'ASC')
      .limit(limit)
      .getMany();

    return rows.filter(
      (row): row is With<PaymentAttemptEntity, 'payment'> =>
        row.payment !== undefined,
    );
  }

  /** Excluding reviewed attempts stops the sweep picking the same rows forever. */
  public async listOpenAfterLifetime(
    now: Date,
    limit: number,
  ): Promise<readonly Attempt[]> {
    return this.manager
      .createQueryBuilder(PaymentAttemptEntity, 'a')
      .innerJoin('a.payment', 'p')
      .where('a.status IN (:...open)', {
        open: [AttemptStatus.UNKNOWN, AttemptStatus.PENDING],
      })
      .andWhere('p.status = :processing AND p.lifetime_ends_at <= :now', {
        processing: PaymentStatus.PROCESSING,
        now,
      })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM review_requests r WHERE r.attempt_id = a.id
          AND r.payment_id = p.id AND r.reason = :reason AND r.resolved_at IS NULL)`,
        { reason: ReviewReason.LIFETIME_ENDED_UNRESOLVED },
      )
      .orderBy('p.lifetime_ends_at', 'ASC')
      .limit(limit)
      .getMany();
  }

  public async getOne(attemptId: string, lock: PaymentLock): Promise<Attempt> {
    const manager = PaymentTransaction.managerOf(lock);
    const row = await manager.findOneBy(PaymentAttemptEntity, {
      id: attemptId,
      paymentId: lock.payment.id,
    });

    if (row === null) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_NOT_IN_LOCKED_PAYMENT,
      );
    }

    return row;
  }

  public async insertOne(
    attempt: NewAttempt,
    lock: PaymentLock,
  ): Promise<Attempt> {
    const manager = PaymentTransaction.managerOf(lock);
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(PaymentAttemptEntity)
      .values({ ...attempt, paymentId: lock.payment.id })
      .returning('*')
      .execute()
      .catch((error: unknown) => this.handleError(error));

    return this.restoreSingleFromRaw(result);
  }

  public async updateStatus(
    update: AttemptUpdate,
    lock: PaymentLock,
  ): Promise<void> {
    const result = await PaymentTransaction.managerOf(lock)
      .createQueryBuilder()
      .update(PaymentAttemptEntity)
      .set({
        status: update.change.status,
        failureCause: update.change.failureCause,
        providerCode: update.providerCode,
        providerMessage: update.providerMessage,
        providerOrderId: () => 'COALESCE(:providerOrderId, provider_order_id)',
        detailsReturned: () => 'details_returned OR :detailsReturned',
        updatedAt: () => 'now()',
      })
      .where('id = :id AND payment_id = :paymentId AND status = :from', {
        id: update.id,
        paymentId: lock.payment.id,
        from: update.change.from,
        providerOrderId: update.providerOrderId,
        detailsReturned: update.detailsReturned,
      })
      .execute()
      .catch((error: unknown) => this.handleError(error));

    if (result.affected === 0) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_CHANGED_OUTSIDE_LOCK,
      );
    }
  }

  public async updateNextCheckAt(
    attempt: Pick<Attempt, 'id' | 'nextCheckAt'>,
    lock: PaymentLock,
  ): Promise<void> {
    const result = await PaymentTransaction.managerOf(lock)
      .createQueryBuilder()
      .update(PaymentAttemptEntity)
      .set({ nextCheckAt: attempt.nextCheckAt })
      .where('id = :id AND payment_id = :paymentId', {
        id: attempt.id,
        paymentId: lock.payment.id,
      })
      .execute();

    if (result.affected === 0) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_NOT_IN_LOCKED_PAYMENT,
      );
    }
  }

  protected override processConstraintViolationError(
    error: ConstraintViolationError,
  ): never {
    if (
      error.constraint ===
      PaymentAttemptEntity.INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED[0]
    ) {
      throw new DatabaseException(
        DatabaseException.Message.OPEN_ATTEMPT_EXISTS,
      );
    }

    throw error;
  }
}
