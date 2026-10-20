import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { InternalApplicationException } from '@core/exceptions';

import type { VerifiedWebhook } from '../../../application-services/webhooks/webhooks.service.types';
import type { VerifiedWebhookRequest } from './webhook-signature.guard';

export const VerifiedWebhookParam = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedWebhook => {
    const request = context.switchToHttp().getRequest<VerifiedWebhookRequest>();

    if (request.verifiedWebhook === undefined) {
      throw new InternalApplicationException(
        'Webhook signature guard did not verify the request',
      );
    }

    return request.verifiedWebhook;
  },
);
