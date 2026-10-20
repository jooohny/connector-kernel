import {
  AttemptStatus,
  EventResult,
  FailureCause,
  PaymentType,
  ProviderStatus,
  ReviewReason,
} from '../../../src/modules/payments/domain/shared/payment-enums';

import {
  DomainInvariantError,
  AttemptTransitionPolicy,
} from '../../../src/modules/payments/domain';

function permutations(values: readonly ProviderStatus[]): ProviderStatus[][] {
  if (values.length === 0) {
    return [[]];
  }

  return values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [
      value,
      ...rest,
    ]),
  );
}

function applyAll(
  policy: AttemptTransitionPolicy,
  events: readonly ProviderStatus[],
): AttemptStatus {
  let current = AttemptStatus.UNKNOWN;

  for (const providerStatus of events) {
    const result = policy.apply({
      current,
      paymentType: PaymentType.DEPOSIT,
      observation: {
        status: providerStatus,
        cause: FailureCause.PROVIDER,
        code: null,
        message: null,
      },
    });

    if (result.result === EventResult.APPLIED) {
      current = result.change.status;
    }
  }

  return current;
}

const ignored = {
  result: EventResult.IGNORED,
};

describe('attempt transitions', () => {
  const policy = new AttemptTransitionPolicy();

  // 7 apply cells.
  it.each([
    {
      current: AttemptStatus.UNKNOWN,
      providerStatus: ProviderStatus.PENDING,
      status: AttemptStatus.PENDING,
    },
    {
      current: AttemptStatus.UNKNOWN,
      providerStatus: ProviderStatus.SUCCEEDED,
      status: AttemptStatus.SUCCEEDED,
    },
    {
      current: AttemptStatus.UNKNOWN,
      providerStatus: ProviderStatus.FAILED,
      status: AttemptStatus.FAILED,
    },
    {
      current: AttemptStatus.UNKNOWN,
      providerStatus: ProviderStatus.EXPIRED,
      status: AttemptStatus.EXPIRED,
    },
    {
      current: AttemptStatus.PENDING,
      providerStatus: ProviderStatus.SUCCEEDED,
      status: AttemptStatus.SUCCEEDED,
    },
    {
      current: AttemptStatus.PENDING,
      providerStatus: ProviderStatus.FAILED,
      status: AttemptStatus.FAILED,
    },
    {
      current: AttemptStatus.PENDING,
      providerStatus: ProviderStatus.EXPIRED,
      status: AttemptStatus.EXPIRED,
    },
  ])(
    'open attempt $current moves to $status on $providerStatus',
    ({ current, providerStatus, status }) => {
      const result = policy.apply({
        current,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: providerStatus,
          cause: FailureCause.PROVIDER,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual({
        result: EventResult.APPLIED,
        change: {
          from: current,
          status,
          failureCause:
            status === AttemptStatus.FAILED ? FailureCause.PROVIDER : null,
        },
        resolvesSystemReviews: status !== AttemptStatus.PENDING,
      });
    },
  );

  // 5 repeated or out-of-date cells.
  it.each([
    [AttemptStatus.PENDING, ProviderStatus.PENDING],
    [AttemptStatus.SUCCEEDED, ProviderStatus.PENDING],
    [AttemptStatus.FAILED, ProviderStatus.PENDING],
    [AttemptStatus.EXPIRED, ProviderStatus.PENDING],
    [AttemptStatus.SUCCEEDED, ProviderStatus.SUCCEEDED],
  ])(
    'a repeated or out-of-date PENDING is ignored',
    (current, providerStatus) => {
      const result = policy.apply({
        current,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: providerStatus,
          cause: null,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual(ignored);
    },
  );

  // 4 terminal finality cells.
  it.each([
    [AttemptStatus.FAILED, ProviderStatus.FAILED],
    [AttemptStatus.FAILED, ProviderStatus.EXPIRED],
    [AttemptStatus.EXPIRED, ProviderStatus.FAILED],
    [AttemptStatus.EXPIRED, ProviderStatus.EXPIRED],
  ])(
    'terminal states are final: FAILED and EXPIRED do not replace each other',
    (current, providerStatus) => {
      const result = policy.apply({
        current,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: providerStatus,
          cause: null,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual(ignored);
    },
  );

  // 4 contradicting terminal cells.
  it.each([
    {
      current: AttemptStatus.SUCCEEDED,
      providerStatus: ProviderStatus.FAILED,
      review: ReviewReason.SUCCEEDED_THEN_FAILED,
    },
    {
      current: AttemptStatus.SUCCEEDED,
      providerStatus: ProviderStatus.EXPIRED,
      review: ReviewReason.SUCCEEDED_THEN_FAILED,
    },
    {
      current: AttemptStatus.FAILED,
      providerStatus: ProviderStatus.SUCCEEDED,
      review: ReviewReason.FAILED_THEN_SUCCEEDED,
    },
    {
      current: AttemptStatus.EXPIRED,
      providerStatus: ProviderStatus.SUCCEEDED,
      review: ReviewReason.FAILED_THEN_SUCCEEDED,
    },
  ])(
    '$current followed by $providerStatus opens review $review',
    ({ current, providerStatus, review }) => {
      const result = policy.apply({
        current,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: providerStatus,
          cause: FailureCause.PROVIDER,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual({
        result: EventResult.SENT_TO_REVIEW,
        review,
      });
    },
  );

  // 5 RETURNED cells.
  it.each(Object.values(AttemptStatus))(
    'RETURNED always opens a review',
    (current) => {
      const result = policy.apply({
        current,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: ProviderStatus.RETURNED,
          cause: null,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual({
        result: EventResult.SENT_TO_REVIEW,
        review: ReviewReason.FUNDS_RETURNED,
      });
    },
  );

  it.each([
    {
      current: AttemptStatus.UNKNOWN,
      providerStatus: null,
      paymentType: PaymentType.DEPOSIT,
    },
    {
      current: AttemptStatus.SUCCEEDED,
      providerStatus: null,
      paymentType: PaymentType.DEPOSIT,
    },
    // A payout has no expiry: EXPIRED on a withdrawal is not a known outcome.
    {
      current: AttemptStatus.PENDING,
      providerStatus: ProviderStatus.EXPIRED,
      paymentType: PaymentType.WITHDRAWAL,
    },
  ])(
    'an unrecognised event opens a review',
    ({ current, providerStatus, paymentType }) => {
      const result = policy.apply({
        current,
        paymentType,
        observation: {
          status: providerStatus,
          cause: null,
          code: null,
          message: null,
        },
      });

      expect(result).toEqual({
        result: EventResult.SENT_TO_REVIEW,
        review: ReviewReason.UNRECOGNISED_EVENT,
      });
    },
  );

  it('applying FAILED requires a cause', () => {
    expect(() =>
      policy.apply({
        current: AttemptStatus.UNKNOWN,
        paymentType: PaymentType.DEPOSIT,
        observation: {
          status: ProviderStatus.FAILED,
          cause: null,
          code: null,
          message: null,
        },
      }),
    ).toThrow(DomainInvariantError);
  });

  it('an ignored FAILED needs no cause', () => {
    expect(
      policy.apply({
        current: AttemptStatus.FAILED,
        paymentType: PaymentType.WITHDRAWAL,
        observation: {
          status: ProviderStatus.FAILED,
          cause: null,
          code: null,
          message: null,
        },
      }),
    ).toEqual(ignored);
  });

  it.each([
    [
      [ProviderStatus.PENDING, ProviderStatus.SUCCEEDED],
      AttemptStatus.SUCCEEDED,
    ],
    [
      [ProviderStatus.PENDING, ProviderStatus.FAILED, ProviderStatus.PENDING],
      AttemptStatus.FAILED,
    ],
    [
      [ProviderStatus.PENDING, ProviderStatus.PENDING, ProviderStatus.EXPIRED],
      AttemptStatus.EXPIRED,
    ],
  ])('events converge in any order', (events, expected) => {
    const finalStatuses = permutations(events).map((events) =>
      applyAll(policy, events),
    );

    expect(new Set(finalStatuses)).toEqual(new Set([expected]));
  });
});
