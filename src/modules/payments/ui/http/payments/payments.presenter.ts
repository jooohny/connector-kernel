import { Inject, Injectable } from '@nestjs/common';

import { PAYMENTS_SERVICE } from '../../../application-services/payments/payments.service.types';
import type { PaymentsService } from '../../../application-services/payments/payments.service.types';
import type { CreatePaymentRequestDto } from './dtos/create-payment.request.dto';
import { CreatedPaymentResponseDto } from './dtos/created-payment.response.dto';
import {
  AttemptResponseDto,
  PaymentResponseDto,
} from './dtos/payment.response.dto';

@Injectable()
export class PaymentsPresenter {
  public constructor(
    @Inject(PAYMENTS_SERVICE) private readonly payments: PaymentsService,
  ) {}

  public async create(
    idempotencyKey: string,
    body: CreatePaymentRequestDto,
  ): Promise<CreatedPaymentResponseDto> {
    return new CreatedPaymentResponseDto(
      await this.payments.create({ idempotencyKey, request: body.serialize() }),
    );
  }

  public async get(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.payments.get(paymentId);

    // The serializer emits only @Expose fields, so the model passes through as is.
    return new PaymentResponseDto({
      ...payment,
      amountMinor: payment.amountMinor.toString(),
      currency: payment.currencyIso3,
      attempts: payment.attempts.map(
        (attempt) => new AttemptResponseDto(attempt),
      ),
    });
  }
}
