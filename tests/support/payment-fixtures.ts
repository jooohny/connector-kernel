import {
  AttemptStatus,
  ConnectorName,
  EventResult,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ReviewReason,
} from '../../src/modules/payments/domain/shared/payment-enums';

import type {
  Attempt,
  NewEventReview,
  NewProviderEvent,
  Payment,
  With,
} from '../../src/modules/payments/domain';

const CREATED_AT = new Date('2026-10-18T00:00:00Z');

/** An IDR bank withdrawal; override fields per test. */
export function paymentFixture(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    idempotencyKey: 'key-1',
    type: PaymentType.WITHDRAWAL,
    method: PaymentMethod.BANK_TRANSFER,
    countryIso2: 'ID',
    currencyIso3: 'IDR',
    amountMinor: 15000000n,
    bankId: 'ID-BCA',
    accountNumber: '123456',
    accountName: 'Test Recipient',
    status: PaymentStatus.PROCESSING,
    declineReason: null,
    lifetimeEndsAt: new Date(CREATED_AT.getTime() + 15 * 60_000),
    resultSnapshot: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** The IDR QR deposit counterpart of paymentFixture. */
export function depositFixture(overrides: Partial<Payment> = {}): Payment {
  return paymentFixture({
    type: PaymentType.DEPOSIT,
    method: PaymentMethod.QR,
    bankId: null,
    accountNumber: null,
    accountName: null,
    ...overrides,
  });
}

export function attemptFixture(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: 'attempt-1',
    paymentId: 'payment-1',
    attemptNo: 1,
    connector: ConnectorName.ALPHA,
    status: AttemptStatus.UNKNOWN,
    failureCause: null,
    providerCode: null,
    providerMessage: null,
    providerOrderId: null,
    detailsReturned: false,
    nextCheckAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

/** What a connector receives: attempt 1 of the given payment. */
export function sendable(
  payment: Payment,
  overrides: Partial<Attempt> = {},
): With<Attempt, 'payment'> {
  return {
    ...attemptFixture({ paymentId: payment.id, ...overrides }),
    payment,
  };
}

export type ParsedEvent = Omit<
  NewProviderEvent,
  'attemptId' | 'paymentId' | 'result' | 'processedAt'
>;

/** What RecordWebhookUseCase stores for an event matched to `attempt`, or unmatched. */
export function eventRow(
  event: ParsedEvent,
  attempt: Attempt | null,
): [NewProviderEvent, NewEventReview | null] {
  if (attempt === null) {
    return [
      {
        ...event,
        attemptId: null,
        paymentId: null,
        result: EventResult.SENT_TO_REVIEW,
        processedAt: event.receivedAt,
      },
      { reason: ReviewReason.UNMATCHED_EVENT, raisedAt: event.receivedAt },
    ];
  }

  return [
    {
      ...event,
      attemptId: attempt.id,
      paymentId: attempt.paymentId,
      result: null,
      processedAt: null,
    },
    null,
  ];
}
