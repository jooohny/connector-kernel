import { IsUUID } from 'class-validator';

import { GatewayValidationException } from '@core/exceptions';

export class PaymentParamsDto {
  @IsUUID('4', { message: GatewayValidationException.Message.INVALID_FORMAT })
  public id: string;
}
