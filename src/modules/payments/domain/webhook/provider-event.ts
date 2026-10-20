import type {
  ConnectorName,
  EventResult,
  FailureCause,
  ProviderStatus,
} from '../shared/payment-enums';

export interface ProviderEvent {
  readonly id: string;
  readonly connector: ConnectorName;
  readonly eventId: string;
  readonly deliveryId: string;
  readonly rawType: string;
  readonly providerStatus: ProviderStatus | null;
  readonly failureCause: FailureCause | null;
  readonly providerCode: string | null;
  readonly providerMessage: string | null;
  /** Written together with paymentId; both null for an unmatched event. */
  readonly attemptId: string | null;
  readonly paymentId: string | null;
  readonly payload: object;
  readonly result: EventResult | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
}
