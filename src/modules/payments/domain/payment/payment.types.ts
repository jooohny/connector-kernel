import type {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentStatus,
} from '../shared/payment-enums';

import type { Attempt, Payment } from './payment';

export interface AttemptChange {
  readonly from: AttemptStatus;
  readonly status: AttemptStatus;
  readonly failureCause: FailureCause | null;
}

export interface NextActionInput {
  readonly payment: Pick<Payment, 'status' | 'type' | 'lifetimeEndsAt'>;
  /** The attempt whose status this event just changed. Call nextAction only after an APPLIED change. */
  readonly attempt: Attempt;
  readonly hasOpenReview: boolean;
  /**
   * Configured connector order for this payment, connectors without a bank
   * mapping removed.
   */
  readonly route: readonly ConnectorName[];
  readonly now: Date;
}

/** PaymentDecider.nextAction: what to do with the payment now. */
export type NextAction =
  /** The payment is already final, or an attempt or a review is still open. */
  | { readonly kind: 'nothingToDo' }
  /** The attempt succeeded, or a deposit attempt expired. */
  | {
      readonly kind: 'complete';
      readonly status: PaymentStatus.SUCCESS | PaymentStatus.EXPIRED;
    }
  /** The attempt failed and no connector may take over. */
  | { readonly kind: 'decline'; readonly reason: string }
  /** The last attempt failed on the provider side; start one on the next connector. */
  | {
      readonly kind: 'tryNextConnector';
      readonly connector: ConnectorName;
      readonly attemptNo: number;
    };
