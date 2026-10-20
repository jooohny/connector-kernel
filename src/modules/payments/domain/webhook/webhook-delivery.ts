import type { SignatureStatus } from '../shared/payment-enums';

export interface WebhookDelivery {
  readonly id: string;
  /** Raw path value, which may be an unknown connector. */
  readonly connector: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: Buffer;
  readonly signatureStatus: SignatureStatus;
  readonly eventId: string | null;
  readonly receivedAt: Date;
}
