import {
  ConnectorName,
  FailureCause,
  ProviderStatus,
  SignatureStatus,
} from '../../../domain/shared/payment-enums';
import { InternalApplicationException } from '@core/exceptions';
import { requireEnvironment } from '@core/modules/config/require-environment';

import type { Attempt, Payment } from '../../../domain/payment/payment';
import type { Connector } from '../../../domain/connector/connector';
import type {
  CreateReply,
  ParsedWebhook,
  WebhookEnvelope,
} from '../../../domain/connector/connector.types';
import { PROVIDER_TIMEOUT_MS } from '../../../domain/shared/payments.constants';
import type { With } from '../../../domain/shared/with';
import type { HttpClient, HttpResult } from '../http-client';
import {
  isRecord,
  readHeader,
  readJsonObject,
  readString,
} from '../provider-json';
import { hmacSha256, signatureMatches } from '../signature';
import {
  BRAVO_BICS,
  BRAVO_EVENT_TYPES,
  BRAVO_FAILURE_CAUSES,
  BRAVO_MAX_SIGNATURE_AGE_MS,
} from './bravo.tables';
import type { BravoConfig, BravoCreateBody } from './bravo.types';

export class BravoConnector implements Connector {
  public readonly id = ConnectorName.BRAVO;

  public constructor(
    private readonly http: HttpClient,
    private readonly config: BravoConfig,
  ) {}

  /** Credentials are read here only: process.env and this class are the only places that know them. */
  public static fromEnvironment(http: HttpClient): BravoConnector {
    return new BravoConnector(http, {
      baseUrl: requireEnvironment(process.env, 'BRAVO_BASE_URL'),
      webhookSecret: requireEnvironment(process.env, 'BRAVO_WEBHOOK_SECRET'),
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
  }

  /** Missing bank mapping → skip this provider, never substitute. */
  public canServe(payment: Pick<Payment, 'type' | 'bankId'>): boolean {
    return BRAVO_BICS.has(payment.bankId ?? '');
  }

  public async create(attempt: With<Attempt, 'payment'>): Promise<CreateReply> {
    const result = await this.http.send({
      method: 'POST',
      url: `${this.config.baseUrl}/payouts`,
      headers: { 'Content-Type': 'application/json' },
      timeoutMs: this.config.timeoutMs,
      body: JSON.stringify(this.createBody(attempt)),
    });

    return this.createReply(result);
  }

  public verifyWebhook(envelope: WebhookEnvelope, now: Date): SignatureStatus {
    // Validate headers, then staleness, then signature.
    const timestamp = readHeader(envelope.headers, 'bravo-timestamp');
    const signature = readHeader(envelope.headers, 'bravo-signature');

    if (timestamp === null || signature === null || !/^\d+$/.test(timestamp)) {
      return SignatureStatus.INVALID;
    }

    if (
      Math.abs(now.getTime() - Number(timestamp) * 1000) >
      BRAVO_MAX_SIGNATURE_AGE_MS
    ) {
      return SignatureStatus.STALE;
    }

    return this.verifySignature({
      rawBody: envelope.rawBody,
      timestamp,
      signature,
    });
  }

  public parseWebhook(envelope: WebhookEnvelope): ParsedWebhook | null {
    const body = readJsonObject(envelope.rawBody.toString('utf8'));

    if (body === null || typeof body.id !== 'string') {
      return null;
    }

    const data = isRecord(body.data) ? body.data : null;
    const type = readString(body.type);
    const status = BRAVO_EVENT_TYPES.get(type ?? '') ?? null;
    const code = readString(data?.failure_reason);

    return {
      eventId: body.id,
      reference: readString(data?.reference),
      rawType: type === null ? '' : type,
      observation: {
        status,
        cause:
          status === ProviderStatus.FAILED
            ? (BRAVO_FAILURE_CAUSES.get(code ?? '') ?? FailureCause.PROVIDER)
            : null,
        code,
        message: null,
      },
      payload: body,
    };
  }

  private verifySignature(input: {
    rawBody: Buffer;
    timestamp: string;
    signature: string;
  }): SignatureStatus {
    const { rawBody, timestamp, signature } = input;
    const decoded = Buffer.from(signature, 'base64');

    if (decoded.length !== 32) {
      return SignatureStatus.INVALID;
    }

    const signed = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);

    return signatureMatches(
      hmacSha256(this.config.webhookSecret, signed),
      decoded,
    )
      ? SignatureStatus.VALID
      : SignatureStatus.INVALID;
  }

  private createBody(attempt: With<Attempt, 'payment'>): BravoCreateBody {
    const { payment } = attempt;

    return {
      reference: attempt.id,
      amount_minor: this.toSafeJsonInteger(payment.amountMinor),
      currency: payment.currencyIso3,
      beneficiary: {
        bank_bic: BRAVO_BICS.get(payment.bankId ?? '') ?? null,
        account: payment.accountNumber,
        name: payment.accountName,
      },
    };
  }

  private toSafeJsonInteger(value: bigint): number {
    const parsed = Number(value);

    if (!Number.isSafeInteger(parsed)) {
      throw new InternalApplicationException(
        'Monetary value exceeds the JSON safe-integer range',
      );
    }

    return parsed;
  }

  private createReply(result: HttpResult): CreateReply {
    const body =
      result.kind === 'response' ? readJsonObject(result.body) : null;

    if (result.kind === 'no-response' || body === null) {
      return this.unknownReply(null, false);
    }

    const payoutId = readString(body.payout_id);
    const accepted =
      result.status === 202 ||
      (result.status === 200 && body.warning === 'DUPLICATE_REFERENCE');

    if (accepted && payoutId !== null) {
      return {
        observation: {
          status: ProviderStatus.PENDING,
          cause: null,
          code: null,
          message: null,
        },
        unclearReject: false,
        providerOrderId: payoutId,
        qrCode: null,
      };
    }

    if (
      result.status === 400 &&
      body.error === 'VALIDATION' &&
      body.field === 'beneficiary.account'
    ) {
      return {
        observation: {
          status: ProviderStatus.FAILED,
          cause: FailureCause.CLIENT,
          code: 'VALIDATION',
          message: 'beneficiary.account',
        },
        unclearReject: false,
        providerOrderId: null,
        qrCode: null,
      };
    }

    return this.unknownReply(
      body,
      result.status === 400 || result.status === 422,
    );
  }

  private unknownReply(
    body: Readonly<Record<string, unknown>> | null,
    unclearReject: boolean,
  ): CreateReply {
    return {
      observation: {
        status: null,
        cause: null,
        code: readString(body?.error),
        message: readString(body?.field),
      },
      unclearReject,
      providerOrderId: null,
      qrCode: null,
    };
  }
}
