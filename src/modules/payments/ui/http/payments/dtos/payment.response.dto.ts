import { Expose, Type } from 'class-transformer';

import { BaseResponseDto } from '@core/presentation/base-response.dto';

import type {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../../../domain/shared/payment-enums';

export class AttemptResponseDto extends BaseResponseDto<AttemptResponseDto> {
  @Expose()
  public attemptNo: number;

  @Expose()
  public connector: ConnectorName;

  @Expose()
  public status: AttemptStatus;

  @Expose()
  public failureCause: FailureCause | null;

  @Expose()
  public providerCode: string | null;

  @Expose()
  public providerMessage: string | null;
}

export class PaymentResponseDto extends BaseResponseDto<PaymentResponseDto> {
  @Expose()
  public id: string;

  @Expose()
  public type: PaymentType;

  @Expose()
  public method: PaymentMethod;

  @Expose()
  public status: PaymentStatus;

  /** Integer minor units as a string: bigint has no JSON form. */
  @Expose()
  public amountMinor: string;

  @Expose()
  public currency: string;

  @Expose()
  public declineReason: string | null;

  @Expose()
  @Type(() => AttemptResponseDto)
  public attempts: AttemptResponseDto[];
}
