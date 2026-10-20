import { ConnectorName } from '../../domain/shared/payment-enums';

import type {
  Connector,
  ConnectorRegistry,
} from '../../domain/connector/connector';
import { AlphaConnector } from './alpha/alpha.connector';
import { BravoConnector } from './bravo/bravo.connector';
import type { HttpClient } from './http-client';

export function buildConnectorRegistry(http: HttpClient): ConnectorRegistry {
  return new Map<ConnectorName, Connector>([
    [ConnectorName.ALPHA, AlphaConnector.fromEnvironment(http)],
    [ConnectorName.BRAVO, BravoConnector.fromEnvironment(http)],
  ]);
}
