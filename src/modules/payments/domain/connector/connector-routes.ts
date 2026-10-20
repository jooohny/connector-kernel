import {
  ConnectorName,
  PaymentMethod,
  PaymentType,
} from '../shared/payment-enums';

import type { Payment } from '../payment/payment';

export type RouteKey = Pick<
  Payment,
  'type' | 'method' | 'countryIso2' | 'currencyIso3'
>;

interface Route extends RouteKey {
  readonly connectors: readonly ConnectorName[];
}

// Order inside a row is the cascade order.
export const ROUTES: readonly Route[] = [
  {
    type: PaymentType.WITHDRAWAL,
    method: PaymentMethod.BANK_TRANSFER,
    countryIso2: 'ID',
    currencyIso3: 'IDR',
    connectors: [ConnectorName.ALPHA, ConnectorName.BRAVO],
  },
  {
    type: PaymentType.DEPOSIT,
    method: PaymentMethod.QR,
    countryIso2: 'ID',
    currencyIso3: 'IDR',
    connectors: [ConnectorName.ALPHA],
  },
];

export class ConnectorRoutes {
  public routeFor(key: RouteKey): readonly ConnectorName[] {
    const route = ROUTES.find(
      (row) =>
        row.type === key.type &&
        row.method === key.method &&
        row.countryIso2 === key.countryIso2 &&
        row.currencyIso3 === key.currencyIso3,
    );

    return route?.connectors ?? [];
  }
}
