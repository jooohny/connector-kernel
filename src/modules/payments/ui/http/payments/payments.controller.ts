import { Body, Controller, Get, Param, Post, UseFilters } from '@nestjs/common';

import { GlobalExceptionFilter } from '@core/exception-filters';

import { CreatePaymentRequestDto } from './dtos/create-payment.request.dto';
import type { CreatedPaymentResponseDto } from './dtos/created-payment.response.dto';
import { PaymentParamsDto } from './dtos/payment-params.dto';
import type { PaymentResponseDto } from './dtos/payment.response.dto';
import { IdempotencyKey } from './idempotency-key.decorator';
import { PaymentsPresenter } from './payments.presenter';

@Controller('payments')
@UseFilters(GlobalExceptionFilter)
export class PaymentsController {
  public constructor(private readonly paymentsPresenter: PaymentsPresenter) {}

  @Post()
  public async create(
    @IdempotencyKey() idempotencyKey: string,
    @Body() body: CreatePaymentRequestDto,
  ): Promise<CreatedPaymentResponseDto> {
    return this.paymentsPresenter.create(idempotencyKey, body);
  }

  @Get(':id')
  public async get(
    @Param() params: PaymentParamsDto,
  ): Promise<PaymentResponseDto> {
    return this.paymentsPresenter.get(params.id);
  }
}
