import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';

import { AuthenticationException, NotFoundException } from '@core/exceptions';

import {
  WEBHOOKS_SERVICE,
  WebhookOutcome,
} from '../../../application-services/webhooks/webhooks.service.types';
import type {
  VerifiedWebhook,
  WebhooksService,
} from '../../../application-services/webhooks/webhooks.service.types';

export interface VerifiedWebhookRequest extends Request<{ connector: string }> {
  verifiedWebhook?: VerifiedWebhook;
}

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  public constructor(
    @Inject(WEBHOOKS_SERVICE) private readonly webhooks: WebhooksService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<VerifiedWebhookRequest>>();

    if (request.rawBody === undefined) {
      throw new AuthenticationException(
        AuthenticationException.Message.INVALID_SIGNATURE,
      );
    }

    const result = await this.webhooks.verify({
      connector: request.params.connector,
      envelope: { headers: request.headers, rawBody: request.rawBody },
    });

    if (result.outcome === WebhookOutcome.UNKNOWN_CONNECTOR) {
      throw new NotFoundException(NotFoundException.Message.UNKNOWN_CONNECTOR);
    }

    if (result.outcome === WebhookOutcome.REJECTED) {
      throw new AuthenticationException(
        AuthenticationException.Message.INVALID_SIGNATURE,
      );
    }

    request.verifiedWebhook = result.webhook;

    return true;
  }
}
