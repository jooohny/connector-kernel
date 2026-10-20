import type { EntityManager } from 'typeorm';

import { DatabaseException } from '@core/exceptions';

import type { PaymentLock } from '../../domain/payment/payment.repository';
import type { Payment } from '../../domain/payment/payment';

/** The only PaymentLock (ADR 0003): created by lock, holds the tx manager. */
export class PaymentTransaction implements PaymentLock {
  public constructor(
    public readonly payment: Payment,
    private readonly manager: EntityManager,
  ) {}

  /** Throws PAYMENT_LOCK_REQUIRED for a foreign lock or one used after its transaction ended. */
  public static managerOf(lock: PaymentLock): EntityManager {
    if (lock instanceof PaymentTransaction) {
      const runner = lock.manager.queryRunner;

      if (runner && !runner.isReleased && runner.isTransactionActive) {
        return lock.manager;
      }
    }

    throw new DatabaseException(
      DatabaseException.Message.PAYMENT_LOCK_REQUIRED,
    );
  }
}
