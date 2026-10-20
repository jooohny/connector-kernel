import type { EventResult } from '../../domain/shared/payment-enums';

import type {
  Attempt,
  CreateReply,
  Observation,
  TransitionResult,
  With,
} from '../../domain';

/** The attempt to send next, with the payment its request is mapped from. */
export type NextAttempt = With<Attempt, 'payment'>;

export type OpenAttemptInput = Pick<Attempt, 'connector' | 'attemptNo'> & {
  readonly now: Date;
};

export interface Report {
  readonly attempt: Attempt;
  readonly observation: Observation;
  readonly providerEventId: string | null;
  readonly now: Date;
  readonly providerOrderId?: string | null;
  readonly detailsReturned?: boolean;
}

export interface ApplyResponseInput {
  readonly attempt: Attempt;
  readonly reply: CreateReply;
  readonly now: Date;
}

export type Applied = Extract<
  TransitionResult,
  { result: EventResult.APPLIED }
>;
