import { Expose } from 'class-transformer';

import { BaseResponseDto } from '@core/presentation/base-response.dto';

import type { PaymentStatus } from '../../../../domain/shared/payment-enums';

export class CreatedPaymentResponseDto extends BaseResponseDto<CreatedPaymentResponseDto> {
  @Expose()
  public id: string;

  @Expose()
  public status: PaymentStatus;

  /** Deposits only; null for withdrawals and when the provider returned none. */
  @Expose()
  public qrCode: string | null;
}
