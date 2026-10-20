import {
  IsEnum,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { GatewayValidationException } from '@core/exceptions';

import type { PaymentRequest } from '../../../../application-services/payments/payments.service.types';
import {
  PaymentMethod,
  PaymentType,
} from '../../../../domain/shared/payment-enums';

export class CreatePaymentRequestDto {
  @IsEnum(PaymentType, {
    message: GatewayValidationException.Message.MUST_BE_ONE_OF,
  })
  public type: PaymentType;

  @IsEnum(PaymentMethod, {
    message: GatewayValidationException.Message.MUST_BE_ONE_OF,
  })
  public method: PaymentMethod;

  @Matches(/^\d{1,16}(\.\d{1,4})?$/, {
    message: GatewayValidationException.Message.INVALID_FORMAT,
  })
  public amount: string;

  @Matches(/^[A-Z]{2}$/, {
    message: GatewayValidationException.Message.INVALID_FORMAT,
  })
  public country: string;

  @Matches(/^[A-Z]{3}$/, {
    message: GatewayValidationException.Message.INVALID_FORMAT,
  })
  public currency: string;

  @ValidateIf(
    (dto: CreatePaymentRequestDto) => dto.type === PaymentType.WITHDRAWAL,
  )
  @MaxLength(32, { message: GatewayValidationException.Message.TOO_LONG })
  @Matches(/\S/, {
    message: GatewayValidationException.Message.REQUIRED_STRING,
  })
  @IsString({ message: GatewayValidationException.Message.REQUIRED_STRING })
  public bankId?: string;

  @ValidateIf(
    (dto: CreatePaymentRequestDto) => dto.type === PaymentType.WITHDRAWAL,
  )
  @MaxLength(34, { message: GatewayValidationException.Message.TOO_LONG })
  @Matches(/\S/, {
    message: GatewayValidationException.Message.REQUIRED_STRING,
  })
  @IsString({ message: GatewayValidationException.Message.REQUIRED_STRING })
  public accountNumber?: string;

  @ValidateIf(
    (dto: CreatePaymentRequestDto) => dto.type === PaymentType.WITHDRAWAL,
  )
  @MaxLength(140, { message: GatewayValidationException.Message.TOO_LONG })
  @Matches(/\S/, {
    message: GatewayValidationException.Message.REQUIRED_STRING,
  })
  @IsString({ message: GatewayValidationException.Message.REQUIRED_STRING })
  public accountName?: string;

  public serialize(): PaymentRequest {
    const withdrawal = this.type === PaymentType.WITHDRAWAL;

    return {
      type: this.type,
      method: this.method,
      amount: this.amount,
      countryIso2: this.country,
      currencyIso3: this.currency,
      bankId: withdrawal ? (this.bankId ?? null) : null,
      accountNumber: withdrawal ? (this.accountNumber ?? null) : null,
      accountName: withdrawal ? (this.accountName ?? null) : null,
    };
  }
}
