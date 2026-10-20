import type { Connector, WebhookEnvelope } from '../../domain';

export interface WebhookCommand {
  /** Raw path value; it may name no connector. */
  readonly connector: string;
  readonly envelope: WebhookEnvelope;
}

export enum WebhookOutcome {
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  UNKNOWN_CONNECTOR = 'unknownConnector',
}
export interface VerifiedWebhook {
  readonly connector: Connector;
  readonly envelope: WebhookEnvelope;
  readonly receivedAt: Date;
}

export type VerifyResult =
  | { readonly outcome: WebhookOutcome.UNKNOWN_CONNECTOR }
  | { readonly outcome: WebhookOutcome.REJECTED }
  | {
      readonly outcome: WebhookOutcome.ACCEPTED;
      readonly webhook: VerifiedWebhook;
    };

export const WEBHOOKS_SERVICE = Symbol('WEBHOOKS_SERVICE');

export interface WebhooksService {
  verify(command: WebhookCommand): Promise<VerifyResult>;
  record(webhook: VerifiedWebhook): Promise<void>;
}
