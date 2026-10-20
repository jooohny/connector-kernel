import { Inject, Injectable } from '@nestjs/common';

import {
  ATTEMPT_REPOSITORY,
  PROVIDER_EVENT_REPOSITORY,
  WEBHOOK_DELIVERY_REPOSITORY,
} from '../../../domain';
import type {
  AttemptRepository,
  ParsedWebhook,
  ProviderEventRepository,
  WebhookDeliveryRepository,
} from '../../../domain';
import {
  EventResult,
  ReviewReason,
  SignatureStatus,
} from '../../../domain/shared/payment-enums';
import type { VerifiedWebhook } from '../webhooks.service.types';

@Injectable()
export class RecordWebhookUseCase {
  public constructor(
    @Inject(WEBHOOK_DELIVERY_REPOSITORY)
    private readonly deliveriesRepo: WebhookDeliveryRepository,
    @Inject(PROVIDER_EVENT_REPOSITORY)
    private readonly eventsRepo: ProviderEventRepository,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attemptsRepo: AttemptRepository,
  ) {}

  public async execute(webhook: VerifiedWebhook): Promise<void> {
    const { connector, envelope, receivedAt } = webhook;
    const parsed = connector.parseWebhook(envelope);
    const stored = await this.deliveriesRepo.insertOne({
      connector: connector.id,
      headers: envelope.headers,
      rawBody: envelope.rawBody,
      receivedAt,
      signatureStatus: SignatureStatus.VALID,
      eventId: parsed?.eventId ?? null,
    });

    if (parsed === null) {
      return;
    }

    await this.recordEvent(webhook, parsed, stored.id);
  }

  private async recordEvent(
    webhook: VerifiedWebhook,
    parsed: ParsedWebhook,
    deliveryId: string,
  ): Promise<void> {
    const { connector, receivedAt } = webhook;
    const attempt = await this.attemptsRepo.getByReference(
      connector.id,
      parsed.reference,
    );
    await this.eventsRepo.insertOneOrIgnore(
      {
        ...parsed,
        connector: connector.id,
        deliveryId,
        receivedAt,
        attemptId: attempt?.id ?? null,
        paymentId: attempt?.paymentId ?? null,
        result: attempt === null ? EventResult.SENT_TO_REVIEW : null,
        processedAt: attempt === null ? receivedAt : null,
      },
      attempt === null
        ? { reason: ReviewReason.UNMATCHED_EVENT, raisedAt: receivedAt }
        : null,
    );
  }
}
