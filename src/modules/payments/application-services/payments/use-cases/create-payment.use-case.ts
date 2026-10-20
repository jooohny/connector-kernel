import { Inject, Injectable } from '@nestjs/common';

import type { ConnectorName } from '../../../domain/shared/payment-enums';
import { ConflictException, ValidationException } from '@core/exceptions/index';

import {
  ATTEMPT_REPOSITORY,
  LIFETIME_MS,
  Money,
  PAYMENT_REPOSITORY,
  SweepSchedule,
} from '../../../domain';
import type {
  AttemptRepository,
  NewPayment,
  PaymentLock,
  PaymentRepository,
} from '../../../domain';
import { PaymentOrchestrator } from '../../payment-orchestrator/payment-orchestrator';
import type { NextAttempt } from '../../payment-orchestrator/payment-orchestrator.types';
import type {
  CreatePaymentCommand,
  PaymentRequest,
  CreatedPayment,
} from '../payments.service.types';

/** Request fields a replay must repeat exactly (ADR 0002). */
const REPLAYED_FIELDS = [
  'type',
  'method',
  'countryIso2',
  'currencyIso3',
  'amountMinor',
  'bankId',
  'accountNumber',
  'accountName',
] as const satisfies readonly (keyof NewPayment)[];

@Injectable()
export class CreatePaymentUseCase {
  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentsRepo: PaymentRepository,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attemptsRepo: AttemptRepository,
    private readonly orchestrator: PaymentOrchestrator,
    private readonly schedule: SweepSchedule,
  ) {}

  public async execute(command: CreatePaymentCommand): Promise<CreatedPayment> {
    const now = new Date();
    const payment: NewPayment = {
      ...command.request,
      amountMinor: this.amountOf(command.request),
      idempotencyKey: command.idempotencyKey,
      lifetimeEndsAt: new Date(now.getTime() + LIFETIME_MS),
    };
    const [connector] = this.routeOf(payment);
    const first = await this.paymentsRepo.insertOrIgnoreByIdempotencyKey(
      payment,
      async (lock) => this.insertFirstAttempt(connector, now, lock),
    );

    return first === null ? this.replay(payment) : this.sendFirst(first);
  }

  private async insertFirstAttempt(
    connector: ConnectorName,
    now: Date,
    lock: PaymentLock,
  ): Promise<NextAttempt> {
    const attempt = await this.attemptsRepo.insertOne(
      {
        attemptNo: 1,
        connector,
        nextCheckAt: this.schedule.firstCheckAt(
          now,
          this.orchestrator.hasStatusQuery(connector),
        ),
      },
      lock,
    );

    return { ...attempt, payment: lock.payment };
  }

  private routeOf(payment: NewPayment): readonly ConnectorName[] {
    const route = this.orchestrator.routeFor(payment);

    if (route.length === 0) {
      throw new ValidationException(
        ValidationException.Message.NO_CONNECTOR_SERVES_PAYMENT,
      );
    }

    return route;
  }

  private amountOf(request: PaymentRequest): bigint {
    try {
      return Money.parseDecimal(request.amount, request.currencyIso3).minor;
    } catch {
      throw new ValidationException(ValidationException.Message.INVALID_AMOUNT);
    }
  }

  private async replay(payment: NewPayment): Promise<CreatedPayment> {
    const existing = await this.paymentsRepo.getByIdempotencyKey(
      payment.idempotencyKey,
    );

    if (!REPLAYED_FIELDS.every((field) => existing[field] === payment[field])) {
      throw new ConflictException(ConflictException.Message.PARAMS_MISMATCH);
    }

    if (existing.resultSnapshot === null) {
      // No stored answer yet (still sending, or the first request died): the client reads the
      // payment itself with GET /payments/:id.
      throw new ConflictException(
        ConflictException.Message.REQUEST_IN_PROGRESS,
        existing.id,
      );
    }

    return existing.resultSnapshot;
  }

  /** The first reply is our result; it is stored as sent (ADR 0002). */
  private async sendFirst(first: NextAttempt): Promise<CreatedPayment> {
    const reply = await this.orchestrator.sendAndApply(first);

    return this.paymentsRepo.lock(first.paymentId, async (lock) => {
      const body: CreatedPayment = {
        id: lock.payment.id,
        status: lock.payment.status,
        qrCode: reply.qrCode,
      };

      await this.paymentsRepo.updateResultSnapshot(body, lock);

      return body;
    });
  }
}
