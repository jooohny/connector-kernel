import type { ConnectorName, SignatureStatus } from '../shared/payment-enums';

import type { Attempt, Payment } from '../payment/payment';
import type { With } from '../shared/with';
import type {
  CreateReply,
  ParsedWebhook,
  StatusReply,
  WebhookEnvelope,
} from './connector.types';

export const CONNECTORS = Symbol('CONNECTORS');

export interface Connector {
  readonly id: ConnectorName;
  /** False means no bank mapping: skip the connector, never substitute. */
  canServe(payment: Pick<Payment, 'type' | 'bankId'>): boolean;
  /**
   * Provider or transport failure returns UNKNOWN, never throws.
   * The request is re-mapped from the payment for every attempt; attempt.id is our reference.
   */
  create(attempt: With<Attempt, 'payment'>): Promise<CreateReply>;
  /** Connectors without a status query omit this method (ADR 0005). */
  queryStatus?(attempt: With<Attempt, 'payment'>): Promise<StatusReply>;
  /** Returns VALID, INVALID or STALE. */
  verifyWebhook(envelope: WebhookEnvelope, now: Date): SignatureStatus;
  /** null: the body is not a recognisable event; the delivery is stored raw. */
  parseWebhook(envelope: WebhookEnvelope): ParsedWebhook | null;
}

export type ConnectorRegistry = ReadonlyMap<string, Connector>;
