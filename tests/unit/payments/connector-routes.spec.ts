import {
  ConnectorName,
  PaymentMethod,
  PaymentType,
} from '../../../src/modules/payments/domain/shared/payment-enums';

import { ConnectorRoutes } from '../../../src/modules/payments/domain';

describe('ConnectorRoutes', () => {
  const routes = new ConnectorRoutes();

  it('routes IDR bank-transfer withdrawals in ID through Alpha then Bravo', () => {
    const route = routes.routeFor({
      type: PaymentType.WITHDRAWAL,
      method: PaymentMethod.BANK_TRANSFER,
      countryIso2: 'ID',
      currencyIso3: 'IDR',
    });

    expect(route).toEqual([ConnectorName.ALPHA, ConnectorName.BRAVO]);
  });

  it('routes IDR QR deposits in ID through Alpha', () => {
    const route = routes.routeFor({
      type: PaymentType.DEPOSIT,
      method: PaymentMethod.QR,
      countryIso2: 'ID',
      currencyIso3: 'IDR',
    });

    expect(route).toEqual([ConnectorName.ALPHA]);
  });

  it('returns no connectors for an unmatched key', () => {
    const route = routes.routeFor({
      type: PaymentType.DEPOSIT,
      method: PaymentMethod.BANK_TRANSFER,
      countryIso2: 'ID',
      currencyIso3: 'IDR',
    });

    expect(route).toEqual([]);
  });
});
