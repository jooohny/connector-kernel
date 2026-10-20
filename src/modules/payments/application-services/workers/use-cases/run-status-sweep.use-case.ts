import { Inject, Injectable } from '@nestjs/common';

import {
  AttemptStatus,
  EventResult,
  ReviewReason,
} from '../../../domain/shared/payment-enums';

import {
  ATTEMPT_REPOSITORY,
  clockFrom,
  PAYMENT_REPOSITORY,
  REVIEW_REPOSITORY,
  SweepSchedule,
  WORK_BATCH_SIZE,
} from '../../../domain';
import type {
  Attempt,
  AttemptRepository,
  PaymentLock,
  PaymentRepository,
  ReviewRepository,
  StatusReply,
} from '../../../domain';
import { PaymentOrchestrator } from '../../payment-orchestrator/payment-orchestrator';
import type { NextAttempt } from '../../payment-orchestrator/payment-orchestrator.types';
import { ProcessWebhooksUseCase } from './process-webhooks.use-case';

interface StatusResult {
  readonly due: NextAttempt;
  readonly reply: StatusReply;
  readonly now: Date;
}

/** ADR 0005: status queries, then the inbox, then the lifetime step. */
@Injectable()
export class RunStatusSweepUseCase {
  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentsRepo: PaymentRepository,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attemptsRepo: AttemptRepository,
    @Inject(REVIEW_REPOSITORY)
    private readonly reviewsRepo: ReviewRepository,
    private readonly orchestrator: PaymentOrchestrator,
    private readonly schedule: SweepSchedule,
    private readonly processWebhooks: ProcessWebhooksUseCase,
  ) {}

  public async run(start: Date): Promise<void> {
    const clock = clockFrom(start);

    await this.queryDueAttempts(clock);
    await this.processWebhooks.run(clock());
    await this.raiseLifetimeReviews(clock());
  }

  private async queryDueAttempts(clock: () => Date): Promise<void> {
    const dueAttempts = await this.attemptsRepo.listDue(
      clock(),
      WORK_BATCH_SIZE,
    );

    // One attempt at a time: each status query is followed by its own transaction.
    for (const due of dueAttempts) {
      await this.queryStatus(due, clock);
    }
  }

  /** ADR 0003: the status query runs with no transaction open. */
  private async queryStatus(
    due: NextAttempt,
    clock: () => Date,
  ): Promise<void> {
    const connector = this.orchestrator.connector(due.connector);

    if (connector.queryStatus === undefined) {
      return;
    }

    const reply = await connector.queryStatus(due);
    // A query can take up to the provider timeout: decide at the time the reply arrived.
    const now = clock();
    const next = await this.paymentsRepo.lock(due.paymentId, async (lock) =>
      this.applyStatus({ due, reply, now }, lock),
    );

    if (next !== null) {
      await this.orchestrator.sendAndApply(next);
    }
  }

  private async applyStatus(
    input: StatusResult,
    lock: PaymentLock,
  ): Promise<NextAttempt | null> {
    const attempt = await this.attemptsRepo.getOne(input.due.id, lock);

    // ADR 0004: no information never changes the attempt; only the next check moves.
    if (input.reply.kind === 'no-information') {
      await this.scheduleNextCheck(attempt, input.now, lock);

      return null;
    }

    const transition = await this.orchestrator.applyReport(
      {
        attempt,
        observation: input.reply.observation,
        now: input.now,
        providerEventId: null,
      },
      lock,
    );

    if (transition.result !== EventResult.APPLIED) {
      await this.scheduleNextCheck(attempt, input.now, lock);

      return null;
    }

    await this.scheduleNextCheck(
      { ...attempt, status: transition.change.status },
      input.now,
      lock,
    );

    return this.orchestrator.decide(attempt.id, input.now, lock);
  }

  /** ADR 0005: always advance; a closed attempt is never checked again. */
  private async scheduleNextCheck(
    attempt: Pick<Attempt, 'id' | 'status' | 'createdAt'>,
    now: Date,
    lock: PaymentLock,
  ): Promise<void> {
    await this.attemptsRepo.updateNextCheckAt(
      {
        id: attempt.id,
        nextCheckAt: this.isOpen(attempt)
          ? this.schedule.nextCheckAt(attempt.createdAt, now)
          : null,
      },
      lock,
    );
  }

  private isOpen(attempt: Pick<Attempt, 'status'>): boolean {
    return (
      attempt.status === AttemptStatus.UNKNOWN ||
      attempt.status === AttemptStatus.PENDING
    );
  }

  /** ADR 0005: an attempt still open when the lifetime ends goes to review, once. */
  private async raiseLifetimeReviews(now: Date): Promise<void> {
    const openAttempts = await this.attemptsRepo.listOpenAfterLifetime(
      now,
      WORK_BATCH_SIZE,
    );

    for (const { id, paymentId } of openAttempts) {
      await this.paymentsRepo.lock(paymentId, async (lock) =>
        this.raiseIfStillOpen({ attemptId: id, now }, lock),
      );
    }
  }

  private async raiseIfStillOpen(
    input: { attemptId: string; now: Date },
    lock: PaymentLock,
  ): Promise<void> {
    const { attemptId, now } = input;
    const attempt = await this.attemptsRepo.getOne(attemptId, lock);

    if (this.isOpen(attempt)) {
      await this.reviewsRepo.insertOne(
        {
          attemptId,
          reason: ReviewReason.LIFETIME_ENDED_UNRESOLVED,
          providerEventId: null,
          raisedAt: now,
        },
        lock,
      );
    }
  }
}
