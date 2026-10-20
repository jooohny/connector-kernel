import { Inject, Injectable } from '@nestjs/common';

import { EventResult } from '../../../domain/shared/payment-enums';

import {
  ATTEMPT_REPOSITORY,
  clockFrom,
  PAYMENT_REPOSITORY,
  PROVIDER_EVENT_REPOSITORY,
  WORK_BATCH_SIZE,
} from '../../../domain';
import type {
  AttemptRepository,
  PaymentLock,
  PaymentRepository,
  ProviderEvent,
  ProviderEventRepository,
  With,
} from '../../../domain';
import { PaymentOrchestrator } from '../../payment-orchestrator/payment-orchestrator';
import type { NextAttempt } from '../../payment-orchestrator/payment-orchestrator.types';

/** ADR 0001: apply a payment's events in arrival order, then decide once. */
@Injectable()
export class ProcessWebhooksUseCase {
  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentsRepo: PaymentRepository,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attemptsRepo: AttemptRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY)
    private readonly eventsRepo: ProviderEventRepository,
    private readonly orchestrator: PaymentOrchestrator,
  ) {}

  public async run(start: Date): Promise<void> {
    const clock = clockFrom(start);
    const paymentIds =
      await this.eventsRepo.listPaymentIdsWithUnprocessed(WORK_BATCH_SIZE);

    // One payment at a time: each holds a transaction, and the pool is small.
    // A cascade sends to a provider between payments, so read the clock for each one.
    for (const paymentId of paymentIds) {
      await this.processPayment(paymentId, clock());
    }
  }

  private async processPayment(paymentId: string, now: Date): Promise<void> {
    const next = await this.paymentsRepo.lockOrSkip(paymentId, async (lock) =>
      this.applyEvents(now, lock),
    );

    if (next !== null) {
      await this.orchestrator.sendAndApply(next);
    }
  }

  private async applyEvents(
    now: Date,
    lock: PaymentLock,
  ): Promise<NextAttempt | null> {
    const events = await this.eventsRepo.listUnprocessed(lock);
    // Only one attempt is open at a time (ADR 0003), so one decision covers the batch.
    let lastChangedAttemptId: string | null = null;

    for (const event of events) {
      const result = await this.applyEvent(event, now, lock);

      if (result === EventResult.APPLIED) {
        lastChangedAttemptId = event.attemptId;
      }
    }

    return lastChangedAttemptId === null
      ? null
      : this.orchestrator.decide(lastChangedAttemptId, now, lock);
  }

  private async applyEvent(
    event: With<ProviderEvent, 'attemptId'>,
    now: Date,
    lock: PaymentLock,
  ): Promise<EventResult> {
    const attempt = await this.attemptsRepo.getOne(event.attemptId, lock);
    const { result } = await this.orchestrator.applyReport(
      {
        attempt,
        observation: {
          status: event.providerStatus,
          cause: event.failureCause,
          code: event.providerCode,
          message: event.providerMessage,
        },
        providerEventId: event.id,
        now,
      },
      lock,
    );

    await this.eventsRepo.updateProcessed(
      { id: event.id, result, processedAt: now },
      lock,
    );

    return result;
  }
}
