import { Injectable } from '@nestjs/common';

import { RecordWebhookUseCase } from './use-cases/record-webhook.use-case';
import { VerifyWebhookUseCase } from './use-cases/verify-webhook.use-case';
import type {
  VerifiedWebhook,
  VerifyResult,
  WebhookCommand,
  WebhooksService,
} from './webhooks.service.types';

@Injectable()
export class WebhooksServiceImplementation implements WebhooksService {
  public constructor(
    private readonly verifyWebhook: VerifyWebhookUseCase,
    private readonly recordWebhook: RecordWebhookUseCase,
  ) {}

  public async verify(command: WebhookCommand): Promise<VerifyResult> {
    return this.verifyWebhook.execute(command);
  }

  public async record(webhook: VerifiedWebhook): Promise<void> {
    await this.recordWebhook.execute(webhook);
  }
}
