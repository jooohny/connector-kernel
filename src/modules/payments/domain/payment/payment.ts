import type {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../shared/payment-enums';

/** The first send result, stored and replayed as is (ADR 0002). */
export interface CreatedPayment {
  readonly id: string;
  readonly status: PaymentStatus;
  readonly qrCode: string | null;
}

/** The payment aggregate: a payment and its attempts, each optionally loaded with the other. */
export interface Payment {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly type: PaymentType;
  readonly method: PaymentMethod;
  readonly countryIso2: string;
  readonly currencyIso3: string;
  /** Integer minor units. */
  readonly amountMinor: bigint;
  readonly bankId: string | null;
  readonly accountNumber: string | null;
  readonly accountName: string | null;
  readonly status: PaymentStatus;
  readonly declineReason: string | null;
  readonly lifetimeEndsAt: Date;
  /** The first create result, replayed for the same idempotency key (ADR 0002). */
  readonly resultSnapshot: CreatedPayment | null;
  readonly createdAt: Date;
  readonly attempts?: readonly Attempt[];
}

export interface Attempt {
  readonly id: string;
  readonly paymentId: string;
  readonly attemptNo: number;
  readonly connector: ConnectorName;
  readonly status: AttemptStatus;
  readonly failureCause: FailureCause | null;
  readonly providerCode: string | null;
  readonly providerMessage: string | null;
  readonly providerOrderId: string | null;
  /** The provider's payment details (a QR today) reached the caller; no other provider can take over. */
  readonly detailsReturned: boolean;
  readonly nextCheckAt: Date | null;
  readonly createdAt: Date;
  readonly payment?: Payment;
}
