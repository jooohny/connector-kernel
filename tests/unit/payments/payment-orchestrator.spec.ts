import { Test } from '@nestjs/testing';

import { PaymentOrchestrator } from '../../../src/modules/payments/application-services/payment-orchestrator/payment-orchestrator';
import {
  ATTEMPT_REPOSITORY,
  AttemptTransitionPolicy,
  CONNECTORS,
  ConnectorRoutes,
  DomainInvariantError,
  PAYMENT_REPOSITORY,
  PaymentDecider,
  type PaymentLock,
  REVIEW_REPOSITORY,
  SweepSchedule,
} from '../../../src/modules/payments/domain';
import {
  ConnectorName,
  ProviderStatus,
} from '../../../src/modules/payments/domain/shared/payment-enums';
import { paymentFixture, sendable } from '../../support/payment-fixtures';

describe('PaymentOrchestrator.sendAndApply', () => {
  it('rejects a create reply that opens another attempt without sending it', async () => {
    const next = sendable(paymentFixture());
    const create = jest.fn().mockResolvedValue({
      observation: {
        status: ProviderStatus.PENDING,
        cause: null,
        code: '00',
        message: null,
      },
      unclearReject: false,
      providerOrderId: 'A-1',
      qrCode: null,
    });
    const bravoCreate = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        PaymentOrchestrator,
        PaymentDecider,
        AttemptTransitionPolicy,
        ConnectorRoutes,
        SweepSchedule,
        {
          provide: PAYMENT_REPOSITORY,
          useValue: {
            lock: async <T>(
              _paymentId: string,
              work: (lock: PaymentLock) => Promise<T>,
            ): Promise<T> => work({ payment: next.payment }),
          },
        },
        {
          provide: ATTEMPT_REPOSITORY,
          useValue: {
            getOne: jest.fn().mockResolvedValue(next),
            updateStatus: jest.fn(),
          },
        },
        { provide: REVIEW_REPOSITORY, useValue: {} },
        {
          provide: CONNECTORS,
          useValue: new Map([
            [ConnectorName.ALPHA, { create }],
            [ConnectorName.BRAVO, { create: bravoCreate }],
          ]),
        },
      ],
    }).compile();
    const orchestrator = module.get(PaymentOrchestrator);
    jest.spyOn(orchestrator, 'decide').mockResolvedValue({
      ...next,
      id: 'attempt-2',
      attemptNo: 2,
      connector: ConnectorName.BRAVO,
    });

    const result = orchestrator.sendAndApply(next);

    await expect(result).rejects.toThrow(DomainInvariantError);
    await expect(result).rejects.toThrow(
      'A create reply opened another attempt',
    );
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(next);
    expect(bravoCreate).not.toHaveBeenCalled();
    await module.close();
  });
});
