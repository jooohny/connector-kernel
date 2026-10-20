import {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../../src/modules/payments/domain/shared/payment-enums';

import {
  ConnectorRoutes,
  LIFETIME_MS,
  type NextActionInput,
  PaymentDecider,
  UNSPECIFIED_DECLINE_REASON,
} from '../../../src/modules/payments/domain';
import { attemptFixture } from '../../support/payment-fixtures';

const routes = new ConnectorRoutes();

const now = new Date('2026-10-18T00:00:00Z');
const attempt = attemptFixture({
  status: AttemptStatus.FAILED,
  failureCause: FailureCause.PROVIDER,
  providerCode: '91',
  providerMessage: 'Provider unavailable',
  createdAt: now,
});
const eligible: NextActionInput = {
  payment: {
    type: PaymentType.WITHDRAWAL,
    status: PaymentStatus.PROCESSING,
    lifetimeEndsAt: new Date(now.getTime() + LIFETIME_MS),
  },
  attempt,
  hasOpenReview: false,
  route: [ConnectorName.ALPHA, ConnectorName.BRAVO],
  now,
};

describe('payment decision', () => {
  const decider = new PaymentDecider();

  it.each([
    PaymentStatus.SUCCESS,
    PaymentStatus.DECLINED,
    PaymentStatus.EXPIRED,
  ])('leaves terminal payment %s unchanged', (status) => {
    const input = { ...eligible, payment: { ...eligible.payment, status } };

    expect(decider.nextAction(input)).toEqual({ kind: 'nothingToDo' });
  });

  it('completes with success when the attempt succeeded, even with an open review', () => {
    const input = {
      ...eligible,
      hasOpenReview: true,
      attempt: { ...attempt, status: AttemptStatus.SUCCEEDED },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'complete',
      status: PaymentStatus.SUCCESS,
    });
  });

  it('completes with deposit expiry before an open review', () => {
    const input = {
      ...eligible,
      payment: { ...eligible.payment, type: PaymentType.DEPOSIT },
      hasOpenReview: true,
      attempt: { ...attempt, status: AttemptStatus.EXPIRED },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'complete',
      status: PaymentStatus.EXPIRED,
    });
  });

  it.each([AttemptStatus.UNKNOWN, AttemptStatus.PENDING])(
    'keeps processing while an attempt is %s',
    (status) => {
      const input = { ...eligible, attempt: { ...attempt, status } };

      expect(decider.nextAction(input)).toEqual({ kind: 'nothingToDo' });
    },
  );

  it('declines a client failure using its message', () => {
    const input = {
      ...eligible,
      attempt: { ...attempt, failureCause: FailureCause.CLIENT },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'decline',
      reason: attempt.providerMessage,
    });
  });

  it.each([FailureCause.CLIENT, FailureCause.PROVIDER])(
    'keeps processing with any open review after a %s failure',
    (failureCause) => {
      const input = {
        ...eligible,
        hasOpenReview: true,
        attempt: { ...attempt, failureCause },
      };

      expect(decider.nextAction(input)).toEqual({ kind: 'nothingToDo' });
    },
  );

  it('starts Bravo attempt 2 after Alpha fails on the provider side', () => {
    expect(decider.nextAction(eligible)).toEqual({
      kind: 'tryNextConnector',
      connector: ConnectorName.BRAVO,
      attemptNo: 2,
    });
  });

  it('follows the configured route order: Alpha after Bravo when the route is Bravo then Alpha', () => {
    const input: NextActionInput = {
      ...eligible,
      route: [ConnectorName.BRAVO, ConnectorName.ALPHA],
      attempt: { ...attempt, connector: ConnectorName.BRAVO },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'tryNextConnector',
      connector: ConnectorName.ALPHA,
      attemptNo: 2,
    });
  });

  it.each<[string, NextActionInput]>([
    [
      '1: latest confirmed provider failure',
      {
        ...eligible,
        attempt: { ...attempt, failureCause: FailureCause.CLIENT },
      },
    ],
    [
      '2: no open attempt',
      {
        ...eligible,
        attempt: { ...attempt, status: AttemptStatus.UNKNOWN },
      },
    ],
    ['3: no open review', { ...eligible, hasOpenReview: true }],
    [
      '4: within lifetime',
      { ...eligible, now: eligible.payment.lifetimeEndsAt },
    ],
    [
      '5: no attempt returned payment details',
      { ...eligible, attempt: { ...attempt, detailsReturned: true } },
    ],
    [
      '6: a connector left in the route',
      { ...eligible, route: [ConnectorName.ALPHA] },
    ],
    [
      '7: below attempt limit',
      {
        ...eligible,
        attempt: { ...attempt, attemptNo: 3 },
      },
    ],
  ])('does not start when condition %s is false', (_condition, input) => {
    expect(decider.nextAction(input).kind).not.toBe('tryNextConnector');
  });

  it('declines an Alpha-only QR deposit after provider failure', () => {
    const input = {
      ...eligible,
      payment: {
        ...eligible.payment,
        type: PaymentType.DEPOSIT,
        method: PaymentMethod.QR,
      },
      route: routes.routeFor({
        type: PaymentType.DEPOSIT,
        method: PaymentMethod.QR,
        countryIso2: 'ID',
        currencyIso3: 'IDR',
      }),
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'decline',
      reason: attempt.providerMessage,
    });
  });

  it('declines when no mapped connectors remain and falls back to the code', () => {
    const input = {
      ...eligible,
      route: [],
      attempt: { ...attempt, providerMessage: null },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'decline',
      reason: '91',
    });
  });

  it.each([FailureCause.CLIENT, FailureCause.PROVIDER])(
    'declines a %s failure without a provider reason with the fallback reason',
    (failureCause) => {
      const input = {
        ...eligible,
        route: [],
        attempt: {
          ...attempt,
          failureCause,
          providerCode: null,
          providerMessage: null,
        },
      };

      expect(decider.nextAction(input)).toEqual({
        kind: 'decline',
        reason: UNSPECIFIED_DECLINE_REASON,
      });
    },
  );

  it('decides on the changed attempt number: Bravo attempt 2 failing on a two-connector route declines', () => {
    const input: NextActionInput = {
      ...eligible,
      attempt: { ...attempt, attemptNo: 2, connector: ConnectorName.BRAVO },
    };

    expect(decider.nextAction(input)).toEqual({
      kind: 'decline',
      reason: attempt.providerMessage,
    });
  });
});

describe('routing', () => {
  it('orders withdrawal connectors Alpha then Bravo', () => {
    expect(
      routes.routeFor({
        type: PaymentType.WITHDRAWAL,
        method: PaymentMethod.BANK_TRANSFER,
        countryIso2: 'ID',
        currencyIso3: 'IDR',
      }),
    ).toEqual([ConnectorName.ALPHA, ConnectorName.BRAVO]);
  });

  it('does not invent routes for unsupported countries or methods', () => {
    expect(
      routes.routeFor({
        type: PaymentType.WITHDRAWAL,
        method: PaymentMethod.QR,
        countryIso2: 'ID',
        currencyIso3: 'IDR',
      }),
    ).toEqual([]);
    expect(
      routes.routeFor({
        type: PaymentType.WITHDRAWAL,
        method: PaymentMethod.BANK_TRANSFER,
        countryIso2: 'US',
        currencyIso3: 'USD',
      }),
    ).toEqual([]);
  });
});
