import type {
  AttemptStatus,
  EventResult,
  PaymentType,
  ReviewReason,
} from '../shared/payment-enums';

import type { Observation } from '../connector/connector.types';
import type { AttemptChange } from '../payment/payment.types';

export type Rule =
  | { readonly action: 'apply'; readonly to: AttemptStatus }
  | { readonly action: 'ignore' }
  | { readonly action: 'review'; readonly review: ReviewReason };

/** What one provider report does to an attempt. */
export type TransitionResult =
  | { readonly result: EventResult.IGNORED }
  | {
      readonly result: EventResult.SENT_TO_REVIEW;
      readonly review: ReviewReason;
    }
  | {
      readonly result: EventResult.APPLIED;
      readonly change: AttemptChange;
      readonly resolvesSystemReviews: boolean;
    };

export interface TransitionInput {
  readonly current: AttemptStatus;
  readonly paymentType: PaymentType;
  readonly observation: Observation;
}
