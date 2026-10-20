import { Inject, Injectable } from '@nestjs/common';

import { WEBHOOK_DELIVERY_REPOSITORY } from '../../../domain';
import type { WebhookDeliveryRepository } from '../../../domain';
import { SignatureStatus } from '../../../domain/shared/payment-enums';
import { PaymentOrchestrator } from '../../payment-orchestrator/payment-orchestrator';
import { WebhookOutcome } from '../webhooks.service.types';
import type { VerifyResult, WebhookCommand } from '../webhooks.service.types';

@Injectable()
export class VerifyWebhookUseCase {
  public constructor(
    @Inject(WEBHOOK_DELIVERY_REPOSITORY)
    private readonly deliveriesRepo: WebhookDeliveryRepository,
    private readonly orchestrator: PaymentOrchestrator,
  ) {}

  /** An unsigned body is never parsed: its event id proves nothing. */
  public async execute(command: WebhookCommand): Promise<VerifyResult> {
    const receivedAt = new Date();
    const connector = this.orchestrator.connectorNamed(command.connector);

    if (connector === null) {
      await this.recordDelivery(
        command,
        receivedAt,
        SignatureStatus.UNKNOWN_CONNECTOR,
      );

      return { outcome: WebhookOutcome.UNKNOWN_CONNECTOR };
    }

    const status = connector.verifyWebhook(command.envelope, receivedAt);

    if (status !== SignatureStatus.VALID) {
      await this.recordDelivery(command, receivedAt, status);

      return { outcome: WebhookOutcome.REJECTED };
    }

    return {
      outcome: WebhookOutcome.ACCEPTED,
      webhook: { connector, envelope: command.envelope, receivedAt },
    };
  }

  private async recordDelivery(
    command: WebhookCommand,
    receivedAt: Date,
    signatureStatus: SignatureStatus,
  ): Promise<void> {
    await this.deliveriesRepo.insertOne({
      connector: command.connector,
      headers: command.envelope.headers,
      rawBody: command.envelope.rawBody,
      receivedAt,
      signatureStatus,
      eventId: null,
    });
  }
}
