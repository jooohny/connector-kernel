import type { FailureCause, ProviderStatus } from '../shared/payment-enums';

export interface CreateReply {
  readonly observation: Observation;
  readonly unclearReject: boolean;
  readonly providerOrderId: string | null;
  readonly qrCode: string | null;
}

export interface Observation {
  readonly status: ProviderStatus | null;
  readonly cause: FailureCause | null;
  readonly code: string | null;
  readonly message: string | null;
}

/** no-information means Alpha 404 (ADR 0004) or a transport error. */
export type StatusReply =
  | { readonly kind: 'observed'; readonly observation: Observation }
  | { readonly kind: 'no-information' };

export interface WebhookEnvelope {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawBody: Buffer;
}

export interface ParsedWebhook {
  readonly eventId: string;
  readonly reference: string | null;
  readonly rawType: string;
  readonly observation: Observation;
  readonly payload: Readonly<Record<string, unknown>>;
}
