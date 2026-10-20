import {
  DomainInvariantError,
  Money,
} from '../../../src/modules/payments/domain';

describe('Money', () => {
  it.each([
    [15000000n, '150000.00'],
    [9007199254740993n, '90071992547409.93'],
    [5n, '0.05'],
  ])('formats %s minor units exactly', (minor, expected) => {
    const money = new Money(minor, 'IDR');

    const decimal = money.toDecimalString();

    expect(decimal).toBe(expected);
  });
});

describe('Money.parseDecimal', () => {
  it.each([
    ['150000.00', 15000000n],
    ['90071992547409.93', 9007199254740993n],
  ])('parses %s IDR as %s minor units', (value, minor) => {
    expect(Money.parseDecimal(value, 'IDR').minor).toBe(minor);
  });

  it.each(['150000.001', '-1', '1e3', '0'])('rejects %s', (value) => {
    expect(() => Money.parseDecimal(value, 'IDR')).toThrow(
      DomainInvariantError,
    );
  });

  it('rejects a currency without a known exponent', () => {
    expect(() => Money.parseDecimal('1.00', 'USD')).toThrow(
      DomainInvariantError,
    );
  });
});
