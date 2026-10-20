import {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentStatus,
  PaymentType,
} from '../shared/payment-enums';

import {
  MAX_ATTEMPTS,
  UNSPECIFIED_DECLINE_REASON,
} from '../shared/payments.constants';
import type { Attempt } from './payment';
import type { NextAction, NextActionInput } from './payment.types';

const NOTHING_TO_DO: NextAction = { kind: 'nothingToDo' };

export class PaymentDecider {
  public nextAction(input: NextActionInput): NextAction {
    const { payment, attempt, hasOpenReview } = input;

    if (payment.status !== PaymentStatus.PROCESSING) {
      return NOTHING_TO_DO;
    }

    if (attempt.status === AttemptStatus.SUCCEEDED) {
      return { kind: 'complete', status: PaymentStatus.SUCCESS };
    }

    if (
      payment.type === PaymentType.DEPOSIT &&
      attempt.status === AttemptStatus.EXPIRED
    ) {
      return { kind: 'complete', status: PaymentStatus.EXPIRED };
    }

    const attemptIsOpen =
      attempt.status === AttemptStatus.UNKNOWN ||
      attempt.status === AttemptStatus.PENDING;

    if (attemptIsOpen) {
      return NOTHING_TO_DO;
    }

    if (hasOpenReview) {
      return NOTHING_TO_DO;
    }

    return this.declineOrCascade(input);
  }

  /** The attempt is closed and did not succeed: decline, or start the next connector. */
  private declineOrCascade(input: NextActionInput): NextAction {
    const { attempt } = input;

    if (attempt.failureCause === FailureCause.CLIENT) {
      return this.decline(attempt);
    }

    const next = this.nextConnector(input);

    if (next === null) {
      return this.decline(attempt);
    }

    return {
      kind: 'tryNextConnector',
      connector: next,
      attemptNo: attempt.attemptNo + 1,
    };
  }

  private decline(attempt: Attempt): NextAction {
    return {
      kind: 'decline',
      reason:
        attempt.providerMessage ??
        attempt.providerCode ??
        UNSPECIFIED_DECLINE_REASON,
    };
  }

  private nextConnector(input: NextActionInput): ConnectorName | null {
    const { payment, attempt, now } = input;

    if (now.getTime() >= payment.lifetimeEndsAt.getTime()) {
      return null;
    }

    if (attempt.detailsReturned) {
      return null;
    }

    if (attempt.attemptNo >= MAX_ATTEMPTS) {
      return null;
    }

    // The route lists connectors in attempt order: attempt N used
    // route[N - 1], so the next one is route[N].
    return input.route[attempt.attemptNo] ?? null;
  }
}
