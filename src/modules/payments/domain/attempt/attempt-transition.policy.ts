import {
  AttemptStatus,
  EventResult,
  FailureCause,
  PaymentType,
  ProviderStatus,
  ReviewReason,
} from '../shared/payment-enums';

import { DomainInvariantError } from '../shared/domain-invariant.error';
import type { Rule, TransitionInput, TransitionResult } from './attempt.types';

function to(status: AttemptStatus): Rule {
  return { action: 'apply', to: status };
}

function review(reason: ReviewReason): Rule {
  return { action: 'review', review: reason };
}

const IGNORE: Rule = { action: 'ignore' };
const IGNORED: TransitionResult = { result: EventResult.IGNORED };

// Row: the status we hold for the attempt. Column: what the provider reports now.
// Cell: move to a status, ignore the report, or keep the status and raise a review.
export const TRANSITIONS: Record<
  AttemptStatus,
  Record<ProviderStatus, Rule>
> = {
  [AttemptStatus.UNKNOWN]: {
    [ProviderStatus.PENDING]: to(AttemptStatus.PENDING),
    [ProviderStatus.SUCCEEDED]: to(AttemptStatus.SUCCEEDED),
    [ProviderStatus.FAILED]: to(AttemptStatus.FAILED),
    [ProviderStatus.EXPIRED]: to(AttemptStatus.EXPIRED),
    [ProviderStatus.RETURNED]: review(ReviewReason.FUNDS_RETURNED),
  },
  [AttemptStatus.PENDING]: {
    [ProviderStatus.PENDING]: IGNORE,
    [ProviderStatus.SUCCEEDED]: to(AttemptStatus.SUCCEEDED),
    [ProviderStatus.FAILED]: to(AttemptStatus.FAILED),
    [ProviderStatus.EXPIRED]: to(AttemptStatus.EXPIRED),
    [ProviderStatus.RETURNED]: review(ReviewReason.FUNDS_RETURNED),
  },
  [AttemptStatus.SUCCEEDED]: {
    [ProviderStatus.PENDING]: IGNORE,
    [ProviderStatus.SUCCEEDED]: IGNORE,
    [ProviderStatus.FAILED]: review(ReviewReason.SUCCEEDED_THEN_FAILED),
    [ProviderStatus.EXPIRED]: review(ReviewReason.SUCCEEDED_THEN_FAILED),
    [ProviderStatus.RETURNED]: review(ReviewReason.FUNDS_RETURNED),
  },
  // FAILED and EXPIRED do not replace one another: a terminal result is final.
  [AttemptStatus.FAILED]: {
    [ProviderStatus.PENDING]: IGNORE,
    [ProviderStatus.SUCCEEDED]: review(ReviewReason.FAILED_THEN_SUCCEEDED),
    [ProviderStatus.FAILED]: IGNORE,
    [ProviderStatus.EXPIRED]: IGNORE,
    [ProviderStatus.RETURNED]: review(ReviewReason.FUNDS_RETURNED),
  },
  [AttemptStatus.EXPIRED]: {
    [ProviderStatus.PENDING]: IGNORE,
    [ProviderStatus.SUCCEEDED]: review(ReviewReason.FAILED_THEN_SUCCEEDED),
    [ProviderStatus.FAILED]: IGNORE,
    [ProviderStatus.EXPIRED]: IGNORE,
    [ProviderStatus.RETURNED]: review(ReviewReason.FUNDS_RETURNED),
  },
};

export const SYSTEM_RESOLVED_REASONS: readonly ReviewReason[] = [
  ReviewReason.LIFETIME_ENDED_UNRESOLVED,
  ReviewReason.UNCONFIRMED_REJECT,
];

export class AttemptTransitionPolicy {
  public apply(input: TransitionInput): TransitionResult {
    const providerStatus = input.observation.status;

    // Withdrawal has no expiry.
    if (
      providerStatus === null ||
      (providerStatus === ProviderStatus.EXPIRED &&
        input.paymentType === PaymentType.WITHDRAWAL)
    ) {
      return {
        result: EventResult.SENT_TO_REVIEW,
        review: ReviewReason.UNRECOGNISED_EVENT,
      };
    }

    const rule = TRANSITIONS[input.current][providerStatus];

    if (rule.action === 'review') {
      return { result: EventResult.SENT_TO_REVIEW, review: rule.review };
    }

    if (rule.action === 'ignore') {
      return IGNORED;
    }

    return this.applyResult(input.current, rule.to, input.observation.cause);
  }

  private applyResult(
    from: AttemptStatus,
    status: AttemptStatus,
    cause: FailureCause | null,
  ): TransitionResult {
    if (status === AttemptStatus.FAILED && cause === null) {
      throw new DomainInvariantError(
        'A FAILED transition requires a failure cause',
      );
    }

    return {
      result: EventResult.APPLIED,
      change: {
        from,
        status,
        failureCause: status === AttemptStatus.FAILED ? cause : null,
      },
      resolvesSystemReviews: status !== AttemptStatus.PENDING,
    };
  }
}
