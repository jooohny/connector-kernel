import { DomainInvariantError } from './domain-invariant.error';
import { CURRENCY_EXPONENTS } from './payments.constants';

const DECIMAL_AMOUNT = /^\d+(\.\d+)?$/;

export class Money {
  public constructor(
    public readonly minor: bigint,
    public readonly currency: string,
  ) {}

  /** A major-unit decimal such as "150000.00" → minor units of that currency. */
  public static parseDecimal(value: string, currency: string): Money {
    const exponent = CURRENCY_EXPONENTS.get(currency);

    if (exponent === undefined || !DECIMAL_AMOUNT.test(value)) {
      throw new DomainInvariantError(
        'Amount must be a decimal number in a supported currency',
      );
    }

    const [whole, fraction = ''] = value.split('.');

    if (fraction.length > exponent) {
      throw new DomainInvariantError(
        'Amount has more decimal places than the currency allows',
      );
    }

    const minor = BigInt(whole + fraction.padEnd(exponent, '0'));

    if (minor <= 0n) {
      throw new DomainInvariantError('Amount must be positive');
    }

    return new Money(minor, currency);
  }

  /** Minor units → a major-unit decimal with the currency's exponent, such as "150000.00". */
  public toDecimalString(): string {
    const exponent = CURRENCY_EXPONENTS.get(this.currency);

    if (exponent === undefined) {
      throw new DomainInvariantError('The currency has no known exponent');
    }

    const divisor = 10n ** BigInt(exponent);
    const whole = this.minor / divisor;

    if (exponent === 0) {
      return whole.toString();
    }

    const fraction = (this.minor % divisor).toString().padStart(exponent, '0');

    return `${whole}.${fraction}`;
  }
}
