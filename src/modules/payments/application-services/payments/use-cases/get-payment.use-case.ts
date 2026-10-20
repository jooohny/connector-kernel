import { Inject, Injectable } from '@nestjs/common';

import { NotFoundException } from '@core/exceptions/index';

import { PAYMENT_REPOSITORY } from '../../../domain';
import type { Payment, PaymentRepository, With } from '../../../domain';

@Injectable()
export class GetPaymentUseCase {
  public constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentsRepo: PaymentRepository,
  ) {}

  public async execute(paymentId: string): Promise<With<Payment, 'attempts'>> {
    const payment = await this.paymentsRepo.getOne(paymentId);

    if (payment === null) {
      throw new NotFoundException(NotFoundException.Message.RESOURCE_NOT_FOUND);
    }

    return payment;
  }
}
