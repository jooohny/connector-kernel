import { Expose } from 'class-transformer';

import { BaseResponseDto } from '@core/presentation/base-response.dto';

import type { WebhookOutcome } from '../../../../application-services/webhooks/webhooks.service.types';

export class WebhookAckResponseDto extends BaseResponseDto<WebhookAckResponseDto> {
  @Expose()
  public status: WebhookOutcome.ACCEPTED;
}
