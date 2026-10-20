import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import type { SelectQueryBuilder } from 'typeorm';

import { PaymentStatus } from '../../../domain/shared/payment-enums';
import { PaymentAttemptEntity, PaymentEntity } from '../entities';
import { DatabaseException, NotFoundException } from '@core/exceptions';
import { BaseRepository } from './base';
import type { ConstraintViolationError } from './base';

import type {
  CreatedPayment,
  NewPayment,
  NextAction,
  Payment,
  PaymentLock,
  PaymentRepository,
  With,
} from '../../../domain';
import { PaymentTransaction } from '../payment-transaction';

type Settlement = Extract<NextAction, { kind: 'complete' | 'decline' }>;
@Injectable()
export class PaymentRepositoryImplementation
  extends BaseRepository<PaymentEntity>
  implements PaymentRepository
{
  public constructor(dataSource: DataSource) {
    super(PaymentEntity, dataSource.createEntityManager());
  }

  public async insertOrIgnoreByIdempotencyKey<T>(
    payment: NewPayment,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T | null> {
    return this.manager
      .transaction(async (manager) => {
        const row = await this.insertPayment(payment, manager);

        return row === null ? null : work(new PaymentTransaction(row, manager));
      })
      .catch((error: unknown) => this.handleError(error));
  }

  private async insertPayment(
    payment: NewPayment,
    manager: EntityManager,
  ): Promise<PaymentEntity | null> {
    const [, columns] = PaymentEntity.UNIQUE__IDEMPOTENCY_KEY;

    return this.insertOrIgnore(manager, payment, { columns });
  }

  public async getByIdempotencyKey(key: string): Promise<Payment> {
    return this.manager.findOneByOrFail(PaymentEntity, {
      idempotencyKey: key,
    });
  }

  public async getOne(
    paymentId: string,
  ): Promise<With<Payment, 'attempts'> | null> {
    const row = await this.manager.findOneBy(PaymentEntity, { id: paymentId });

    if (row === null) {
      return null;
    }

    const attempts = await this.manager.find(PaymentAttemptEntity, {
      where: { paymentId },
      order: { attemptNo: 'ASC' },
    });

    return { ...row, attempts };
  }

  public async lock<T>(
    paymentId: string,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T> {
    return this.manager
      .transaction(async (manager) => {
        const row = await this.lockQuery(manager, paymentId).getOne();

        if (row === null) {
          throw new NotFoundException(
            NotFoundException.Message.RESOURCE_NOT_FOUND,
          );
        }

        return work(new PaymentTransaction(row, manager));
      })
      .catch((error: unknown) => this.handleError(error));
  }

  /** Busy or missing; the inbox passes payment ids it just read. */
  public async lockOrSkip<T>(
    paymentId: string,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T | null> {
    return this.manager
      .transaction(async (manager) => {
        const row = await this.lockQuery(manager, paymentId)
          .setOnLocked('skip_locked')
          .getOne();

        if (row === null) {
          return null;
        }

        return work(new PaymentTransaction(row, manager));
      })
      .catch((error: unknown) => this.handleError(error));
  }

  private lockQuery(
    manager: EntityManager,
    paymentId: string,
  ): SelectQueryBuilder<PaymentEntity> {
    return manager
      .createQueryBuilder(PaymentEntity, 'p')
      .where('p.id = :paymentId', { paymentId })
      .setLock('for_no_key_update');
  }

  public async updateStatus(
    action: Settlement,
    lock: PaymentLock,
  ): Promise<void> {
    const manager = PaymentTransaction.managerOf(lock);
    const result = await manager
      .createQueryBuilder()
      .update(PaymentEntity)
      .set({
        status:
          action.kind === 'complete' ? action.status : PaymentStatus.DECLINED,
        declineReason: action.kind === 'decline' ? action.reason : null,
        updatedAt: () => 'now()',
      })
      .where('id = :id AND status = :status', {
        id: lock.payment.id,
        status: PaymentStatus.PROCESSING,
      })
      .execute();

    if (result.affected === 0) {
      throw new DatabaseException(
        DatabaseException.Message.ROW_CHANGED_OUTSIDE_LOCK,
      );
    }
  }

  public async updateResultSnapshot(
    body: CreatedPayment,
    lock: PaymentLock,
  ): Promise<void> {
    const manager = PaymentTransaction.managerOf(lock);
    const result = await manager
      .createQueryBuilder()
      .update(PaymentEntity)
      .set({ resultSnapshot: () => 'CAST(:body AS jsonb)' })
      .where('id = :id AND result_snapshot IS NULL', {
        id: lock.payment.id,
        body: JSON.stringify(body),
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
