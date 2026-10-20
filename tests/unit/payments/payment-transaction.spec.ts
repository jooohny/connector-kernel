import { DatabaseException } from '@core/exceptions';

import { PaymentTransaction } from '../../../src/modules/payments/infrastructure/persistence/payment-transaction';
import { depositFixture } from '../../support/payment-fixtures';

const payment = depositFixture();

describe('PaymentTransaction', () => {
  it('rejects a foreign lock', () => {
    expect(() => PaymentTransaction.managerOf({ payment })).toThrow(
      new DatabaseException(DatabaseException.Message.PAYMENT_LOCK_REQUIRED),
    );
  });
});
