import type { ConnectorName } from '../shared/payment-enums';

import type { PaymentLock } from '../payment/payment.repository';
import type { AttemptChange } from '../payment/payment.types';
import type { With } from '../shared/with';
import type { Attempt } from '../payment/payment';

export const ATTEMPT_REPOSITORY = Symbol('ATTEMPT_REPOSITORY');

export type NewAttempt = Pick<
  Attempt,
  'attemptNo' | 'connector' | 'nextCheckAt'
>;

/** providerOrderId null keeps the stored value; detailsReturned never resets once true. */
export type AttemptUpdate = Pick<
  Attempt,
  | 'id'
  | 'providerCode'
  | 'providerMessage'
  | 'providerOrderId'
  | 'detailsReturned'
> & { readonly change: AttemptChange };

export interface AttemptRepository {
  getByReference(
    connector: ConnectorName,
    reference: string | null,
  ): Promise<Attempt | null>;
  /** Unlocked read (ADR 0005). */
  listDue(
    now: Date,
    limit: number,
  ): Promise<readonly With<Attempt, 'payment'>[]>;
  /** Open attempts of processing payments whose lifetime ended and that have no open lifetime review. */
  listOpenAfterLifetime(now: Date, limit: number): Promise<readonly Attempt[]>;
  getOne(attemptId: string, lock: PaymentLock): Promise<Attempt>;
  /** For lock.payment.id. */
  insertOne(attempt: NewAttempt, lock: PaymentLock): Promise<Attempt>;
  /** Writes WHERE status = change.from; zero rows throws (ADR 0003). */
  updateStatus(update: AttemptUpdate, lock: PaymentLock): Promise<void>;
  updateNextCheckAt(
    attempt: Pick<Attempt, 'id' | 'nextCheckAt'>,
    lock: PaymentLock,
  ): Promise<void>;
}
