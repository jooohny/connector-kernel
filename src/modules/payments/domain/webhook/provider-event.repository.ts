import type { ParsedWebhook } from '../connector/connector.types';
import type { PaymentLock } from '../payment/payment.repository';
import type { Review } from '../review/review';
import type { With } from '../shared/with';
import type { ProviderEvent } from './provider-event';

export const PROVIDER_EVENT_REPOSITORY = Symbol('PROVIDER_EVENT_REPOSITORY');

export type NewProviderEvent = ParsedWebhook &
  Pick<
    ProviderEvent,
    | 'connector'
    | 'deliveryId'
    | 'receivedAt'
    | 'attemptId'
    | 'paymentId'
    | 'result'
    | 'processedAt'
  >;

/** The review of an unmatched event; it has no payment or attempt. */
export type NewEventReview = Pick<Review, 'reason' | 'raisedAt'>;

export interface ProviderEventRepository {
  /** The review, when given, is written in the event's transaction. */
  insertOneOrIgnore(
    event: NewProviderEvent,
    review: NewEventReview | null,
  ): Promise<ProviderEvent | null>;
  listPaymentIdsWithUnprocessed(limit: number): Promise<readonly string[]>;
  /** Events are in arrival order (ADR 0001). */
  listUnprocessed(
    lock: PaymentLock,
  ): Promise<readonly With<ProviderEvent, 'attemptId'>[]>;
  updateProcessed(
    event: Pick<ProviderEvent, 'id' | 'result' | 'processedAt'>,
    lock: PaymentLock,
  ): Promise<void>;
}
