import { Inject, Injectable } from '@nestjs/common';

import {
  AttemptStatus,
  ConnectorName,
  EventResult,
  ReviewReason,
} from '../../domain/shared/payment-enums';

import {
  ATTEMPT_REPOSITORY,
  AttemptTransitionPolicy,
  ConnectorRoutes,
  CONNECTORS,
  DomainInvariantError,
  PAYMENT_REPOSITORY,
  PaymentDecider,
  REVIEW_REPOSITORY,
  SweepSchedule,
} from '../../domain';
import type {
  AttemptRepository,
  Connector,
  ConnectorRegistry,
  CreateReply,
  NextAction,
  Payment,
  PaymentLock,
  PaymentRepository,
  ReviewRepository,
  TransitionResult,
} from '../../domain';

import type {
  Applied,
  CreateReplyInput,
  NextAttempt,
  Report,
} from './payment-orchestrator.types';

/** Steps shared by create, the status sweep and webhook processing. */
@Injectable()
export class PaymentOrchestrator {
  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentsRepo: PaymentRepository,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attemptsRepo: AttemptRepository,
    @Inject(REVIEW_REPOSITORY)
    private readonly reviewsRepo: ReviewRepository,
    @Inject(CONNECTORS) private readonly registry: ConnectorRegistry,
    private readonly decider: PaymentDecider,
    private readonly policy: AttemptTransitionPolicy,
    private readonly routes: ConnectorRoutes,
    private readonly schedule: SweepSchedule,
  ) {}

  /** The only place a route is computed: configured order, unservable connectors dropped. */
  public routeFor(
    payment: Pick<
      Payment,
      'type' | 'method' | 'countryIso2' | 'currencyIso3' | 'bankId'
    >,
  ): readonly ConnectorName[] {
    return this.routes
      .routeFor(payment)
      .filter((name) => this.connector(name).canServe(payment));
  }

  public connector(name: ConnectorName): Connector {
    const connector = this.registry.get(name);

    if (connector === undefined) {
      throw new DomainInvariantError(`No connector is registered as ${name}`);
    }

    return connector;
  }

  /** Raw webhook path value → connector, or null when none has that name. */
  public connectorNamed(name: string): Connector | null {
    return this.registry.get(name) ?? null;
  }

  public hasStatusQuery(name: ConnectorName): boolean {
    return this.connector(name).queryStatus !== undefined;
  }

  /**
   * ADR 0003: the provider is called with no transaction open.
   * A create reply never opens another attempt: every create reject is unclear except an invalid
   * account, which declines. Only a webhook or a status query cascades.
   */
  public async sendAndApply(next: NextAttempt): Promise<CreateReply> {
    const reply = await this.connector(next.connector).create(next);

    await this.paymentsRepo.lock(next.paymentId, async (lock) => {
      const now = new Date();
      const attempt = await this.attemptsRepo.getOne(next.id, lock);

      if (reply.observation.status === null) {
        await this.applyUnknownReply({ attempt, reply, now }, lock);

        return;
      }

      const { result } = await this.applyReport(
        {
          attempt,
          observation: reply.observation,
          providerEventId: null,
          providerOrderId: reply.providerOrderId,
          detailsReturned: reply.qrCode !== null,
          now,
        },
        lock,
      );

      if (result !== EventResult.APPLIED) {
        // A webhook got here first and keeps its status; only the reply knows the QR was returned.
        await this.attemptsRepo.updateStatus(
          {
            id: attempt.id,
            change: {
              from: attempt.status,
              status: attempt.status,
              failureCause: attempt.failureCause,
            },
            providerCode: attempt.providerCode,
            providerMessage: attempt.providerMessage,
            providerOrderId: reply.providerOrderId,
            detailsReturned: reply.qrCode !== null,
          },
          lock,
        );

        return;
      }

      if ((await this.decide(next.id, now, lock)) !== null) {
        throw new DomainInvariantError('A create reply opened another attempt');
      }
    });

    return reply;
  }

  public async decide(
    attemptId: string,
    now: Date,
    lock: PaymentLock,
  ): Promise<NextAttempt | null> {
    const attempt = await this.attemptsRepo.getOne(attemptId, lock);
    const hasOpenReview = await this.reviewsRepo.hasOpen(lock);
    const action = this.decider.nextAction({
      payment: lock.payment,
      attempt,
      hasOpenReview,
      route: this.routeFor(lock.payment),
      now,
    });

    return this.perform(action, now, lock);
  }

  private async applyUnknownReply(
    input: CreateReplyInput,
    lock: PaymentLock,
  ): Promise<void> {
    const { attempt, reply, now } = input;

    if (attempt.status !== AttemptStatus.UNKNOWN) {
      return;
    }

    await this.attemptsRepo.updateStatus(
      {
        id: attempt.id,
        change: {
          from: AttemptStatus.UNKNOWN,
          status: AttemptStatus.UNKNOWN,
          failureCause: null,
        },
        providerCode: reply.observation.code,
        providerMessage: reply.observation.message,
        providerOrderId: reply.providerOrderId,
        detailsReturned: reply.qrCode !== null,
      },
      lock,
    );

    // No status query will ever confirm this reject (ADR 0005).
    if (reply.unclearReject && !this.hasStatusQuery(attempt.connector)) {
      await this.reviewsRepo.insertOne(
        {
          attemptId: attempt.id,
          reason: ReviewReason.UNCONFIRMED_REJECT,
          providerEventId: null,
          raisedAt: now,
        },
        lock,
      );
    }
  }

  public async applyReport(
    report: Report,
    lock: PaymentLock,
  ): Promise<TransitionResult> {
    const result = this.policy.apply({
      current: report.attempt.status,
      paymentType: lock.payment.type,
      observation: report.observation,
    });

    if (result.result === EventResult.APPLIED) {
      await this.writeChange(report, result, lock);
    }

    if (result.result === EventResult.SENT_TO_REVIEW) {
      await this.reviewsRepo.insertOne(
        {
          attemptId: report.attempt.id,
          reason: result.review,
          providerEventId: report.providerEventId,
          raisedAt: report.now,
        },
        lock,
      );
    }

    return result;
  }

  private async writeChange(
    report: Report,
    applied: Applied,
    lock: PaymentLock,
  ): Promise<void> {
    const { attempt, observation } = report;

    await this.attemptsRepo.updateStatus(
      {
        id: attempt.id,
        change: applied.change,
        providerCode: observation.code,
        providerMessage: observation.message,
        providerOrderId: report.providerOrderId ?? null,
        detailsReturned: report.detailsReturned ?? false,
      },
      lock,
    );

    if (applied.resolvesSystemReviews) {
      await this.reviewsRepo.updateSystemResolved(attempt.id, report.now, lock);
    }
  }

  private async perform(
    action: NextAction,
    now: Date,
    lock: PaymentLock,
  ): Promise<NextAttempt | null> {
    if (action.kind === 'complete' || action.kind === 'decline') {
      await this.paymentsRepo.updateStatus(action, lock);

      return null;
    }

    if (action.kind === 'nothingToDo') {
      return null;
    }

    const attempt = await this.attemptsRepo.insertOne(
      {
        attemptNo: action.attemptNo,
        connector: action.connector,
        nextCheckAt: this.schedule.firstCheckAt(
          now,
          this.hasStatusQuery(action.connector),
        ),
      },
      lock,
    );

    return { ...attempt, payment: lock.payment };
  }
}
