import type { With } from '../shared/with';
import type { CreatedPayment, Payment } from './payment';
import type { NextAction } from './payment.types';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

/** Proof that the payment row is locked; exists only inside PaymentRepository.lock. */
export interface PaymentLock {
  readonly payment: Payment;
}

export type NewPayment = Omit<
  Payment,
  | 'id'
  | 'status'
  | 'declineReason'
  | 'resultSnapshot'
  | 'createdAt'
  | 'attempts'
>;

export interface PaymentRepository {
  /**
   * Inserts the payment and runs work in the same transaction (attempt 1, ADR 0002);
   * null when the idempotency key already exists.
   */
  insertOrIgnoreByIdempotencyKey<T>(
    payment: NewPayment,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T | null>;
  /** Called only after the key conflicted, so the row exists. */
  getByIdempotencyKey(key: string): Promise<Payment>;
  getOne(paymentId: string): Promise<With<Payment, 'attempts'> | null>;
  /**
   * One transaction with FOR NO KEY UPDATE;
   * work never calls the network (ADR 0003).
   */
  lock<T>(
    paymentId: string,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T>;
  /** Inbox worker only: SKIP LOCKED returns null when the payment is busy. */
  lockOrSkip<T>(
    paymentId: string,
    work: (lock: PaymentLock) => Promise<T>,
  ): Promise<T | null>;
  /** Only status and result snapshot write the payment; no reads follow updateStatus (ADR 0003). */
  updateStatus(
    action: Extract<NextAction, { kind: 'complete' | 'decline' }>,
    lock: PaymentLock,
  ): Promise<void>;
  updateResultSnapshot(body: CreatedPayment, lock: PaymentLock): Promise<void>;
}
