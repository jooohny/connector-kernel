import { Inject, Injectable } from '@nestjs/common';

import {
  WebhookOutcome,
  WEBHOOKS_SERVICE,
} from '../../../application-services/webhooks/webhooks.service.types';
import type {
  VerifiedWebhook,
  WebhooksService,
} from '../../../application-services/webhooks/webhooks.service.types';
import { WebhookAckResponseDto } from './dtos/webhook-ack.response.dto';

@Injectable()
export class WebhooksPresenter {
  public constructor(
    @Inject(WEBHOOKS_SERVICE) private readonly webhooks: WebhooksService,
  ) {}

  /** ADR 0001: every delivery is recorded before this answers. */
  public async receive(
    webhook: VerifiedWebhook,
  ): Promise<WebhookAckResponseDto> {
    await this.webhooks.record(webhook);

    return new WebhookAckResponseDto({ status: WebhookOutcome.ACCEPTED });
  }
}
