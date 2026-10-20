import type { PaymentLock } from '../payment/payment.repository';
import type { With } from '../shared/with';
import type { Review } from './review';

export const REVIEW_REPOSITORY = Symbol('REVIEW_REPOSITORY');

export type NewReview = With<
  Pick<Review, 'attemptId' | 'reason' | 'providerEventId' | 'raisedAt'>,
  'attemptId'
>;

export interface ReviewRepository {
  hasOpen(lock: PaymentLock): Promise<boolean>;
  /** ON CONFLICT DO NOTHING returns null when already open (ADR 0005). */
  insertOne(review: NewReview, lock: PaymentLock): Promise<Review | null>;
  updateSystemResolved(
    attemptId: string,
    resolvedAt: Date,
    lock: PaymentLock,
  ): Promise<void>;
}
