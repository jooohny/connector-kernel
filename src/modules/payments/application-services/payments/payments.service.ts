import { Injectable } from '@nestjs/common';

import type { Payment, With } from '../../domain';

import { CreatePaymentUseCase } from './use-cases/create-payment.use-case';
import { GetPaymentUseCase } from './use-cases/get-payment.use-case';
import type {
  CreatedPayment,
  CreatePaymentCommand,
  PaymentsService,
} from './payments.service.types';

@Injectable()
export class PaymentsServiceImplementation implements PaymentsService {
  public constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly getPayment: GetPaymentUseCase,
  ) {}

  public async create(command: CreatePaymentCommand): Promise<CreatedPayment> {
    return this.createPayment.execute(command);
  }

  public async get(paymentId: string): Promise<With<Payment, 'attempts'>> {
    return this.getPayment.execute(paymentId);
  }
}
