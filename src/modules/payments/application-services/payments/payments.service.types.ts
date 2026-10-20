import type {
  PaymentMethod,
  PaymentType,
} from '../../domain/shared/payment-enums';
import type { CreatedPayment, Payment } from '../../domain/payment/payment';
import type { With } from '../../domain/shared/with';

export type { CreatedPayment } from '../../domain/payment/payment';

/** POST /payments body after validation; amount is a major-unit decimal ("150000.00"). */
export interface PaymentRequest {
  readonly type: PaymentType;
  readonly method: PaymentMethod;
  readonly amount: string;
  readonly countryIso2: string;
  readonly currencyIso3: string;
  readonly bankId: string | null;
  readonly accountNumber: string | null;
  readonly accountName: string | null;
}

export interface CreatePaymentCommand {
  readonly idempotencyKey: string;
  readonly request: PaymentRequest;
}

export const PAYMENTS_SERVICE = Symbol('PAYMENTS_SERVICE');

export interface PaymentsService {
  create(command: CreatePaymentCommand): Promise<CreatedPayment>;
  get(paymentId: string): Promise<With<Payment, 'attempts'>>;
}
