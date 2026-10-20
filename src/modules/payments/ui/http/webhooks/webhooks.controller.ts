import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { GlobalExceptionFilter } from '@core/exception-filters';

import type { VerifiedWebhook } from '../../../application-services/webhooks/webhooks.service.types';
import type { WebhookAckResponseDto } from './dtos/webhook-ack.response.dto';
import { VerifiedWebhookParam } from './signed-webhook.decorator';
import { WebhookSignatureGuard } from './webhook-signature.guard';
import { WebhooksPresenter } from './webhooks.presenter';

@Controller('webhooks')
@UseFilters(GlobalExceptionFilter)
export class WebhooksController {
  public constructor(private readonly webhooksPresenter: WebhooksPresenter) {}

  @Post(':connector')
  @UseGuards(WebhookSignatureGuard)
  @HttpCode(HttpStatus.OK)
  public async receive(
    @VerifiedWebhookParam() webhook: VerifiedWebhook,
  ): Promise<WebhookAckResponseDto> {
    return this.webhooksPresenter.receive(webhook);
  }
}
