import { Inject, Injectable } from '@nestjs/common';

import { CONNECTORS, WEBHOOK_DELIVERY_REPOSITORY } from '../../../domain';
import type {
  ConnectorRegistry,
  WebhookDeliveryRepository,
} from '../../../domain';
import { SignatureStatus } from '../../../domain/shared/payment-enums';
import { WebhookOutcome } from '../webhooks.service.types';
import type { VerifyResult, WebhookCommand } from '../webhooks.service.types';

@Injectable()
export class VerifyWebhookUseCase {
  public constructor(
    @Inject(WEBHOOK_DELIVERY_REPOSITORY)
    private readonly deliveriesRepo: WebhookDeliveryRepository,
    @Inject(CONNECTORS) private readonly connectors: ConnectorRegistry,
  ) {}

  /** An unsigned body is never parsed: its event id proves nothing. */
  public async execute(command: WebhookCommand): Promise<VerifyResult> {
    const receivedAt = new Date();
    const connector = this.connectors.get(command.connector);

    if (connector === undefined) {
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
