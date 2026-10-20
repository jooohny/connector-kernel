import {
  ConnectorName,
  FailureCause,
  PaymentType,
  ProviderStatus,
  SignatureStatus,
} from '../../../domain/shared/payment-enums';
import { requireEnvironment } from '@core/modules/config/require-environment';

import type { Attempt, Payment } from '../../../domain/payment/payment';
import type { Connector } from '../../../domain/connector/connector';
import type {
  CreateReply,
  Observation,
  ParsedWebhook,
  StatusReply,
  WebhookEnvelope,
} from '../../../domain/connector/connector.types';
import { Money } from '../../../domain/shared/money';
import { PROVIDER_TIMEOUT_MS } from '../../../domain/shared/payments.constants';
import type { With } from '../../../domain/shared/with';
import type { HttpClient, HttpResult } from '../http-client';
import { readHeader, readJsonObject, readString } from '../provider-json';
import { hmacSha256, signatureMatches } from '../signature';
import {
  ALPHA_BANK_CODES,
  ALPHA_CREATE_REJECTS,
  ALPHA_FAILURE_CAUSES,
  ALPHA_STATUSES,
} from './alpha.tables';
import type { AlphaConfig, AlphaCreateBody } from './alpha.types';

export class AlphaConnector implements Connector {
  public readonly id = ConnectorName.ALPHA;

  public constructor(
    private readonly http: HttpClient,
    private readonly config: AlphaConfig,
  ) {}

  /** Credentials are read here only: process.env and this class are the only places that know them. */
  public static fromEnvironment(http: HttpClient): AlphaConnector {
    return new AlphaConnector(http, {
      baseUrl: requireEnvironment(process.env, 'ALPHA_BASE_URL'),
      apiKey: requireEnvironment(process.env, 'ALPHA_API_KEY'),
      webhookSecret: requireEnvironment(process.env, 'ALPHA_WEBHOOK_SECRET'),
      timeoutMs: PROVIDER_TIMEOUT_MS,
    });
  }

  /** Missing bank mapping → skip this provider, never substitute. */
  public canServe(payment: Pick<Payment, 'type' | 'bankId'>): boolean {
    return (
      payment.type === PaymentType.DEPOSIT ||
      ALPHA_BANK_CODES.has(payment.bankId ?? '')
    );
  }

  public async create(attempt: With<Attempt, 'payment'>): Promise<CreateReply> {
    const result = await this.http.send({
      method: 'POST',
      url: `${this.config.baseUrl}/v2/orders`,
      headers: {
        'X-Api-Key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      timeoutMs: this.config.timeoutMs,
      body: JSON.stringify(this.createBody(attempt)),
    });

    return this.createReply(result, attempt.payment.type);
  }

  public async queryStatus(
    attempt: With<Attempt, 'payment'>,
  ): Promise<StatusReply> {
    const result = await this.http.send({
      method: 'GET',
      url: `${this.config.baseUrl}/v2/orders/${encodeURIComponent(attempt.id)}`,
      headers: { 'X-Api-Key': this.config.apiKey },
      timeoutMs: this.config.timeoutMs,
      body: null,
    });
    const body =
      result.kind === 'response' ? readJsonObject(result.body) : null;

    if (
      result.kind === 'no-response' ||
      result.status !== 200 ||
      body === null
    ) {
      return { kind: 'no-information' };
    }

    return { kind: 'observed', observation: this.observation(body) };
  }

  public verifyWebhook(envelope: WebhookEnvelope): SignatureStatus {
    const header = readHeader(envelope.headers, 'x-alpha-signature');

    if (header === null || !/^[a-f\d]{64}$/i.test(header)) {
      return SignatureStatus.INVALID;
    }

    const expected = hmacSha256(this.config.webhookSecret, envelope.rawBody);

    return signatureMatches(expected, Buffer.from(header, 'hex'))
      ? SignatureStatus.VALID
      : SignatureStatus.INVALID;
  }

  public parseWebhook(envelope: WebhookEnvelope): ParsedWebhook | null {
    const body = readJsonObject(envelope.rawBody.toString('utf8'));

    if (body === null || typeof body.event_id !== 'string') {
      return null;
    }

    return {
      eventId: body.event_id,
      reference: readString(body.merchant_ref),
      rawType: typeof body.status === 'string' ? body.status : '',
      observation: this.observation(body),
      payload: body,
    };
  }

  private createBody(attempt: With<Attempt, 'payment'>): AlphaCreateBody {
    const { payment } = attempt;
    const amount = new Money(payment.amountMinor, payment.currencyIso3);
    const common: AlphaCreateBody = {
      merchant_ref: attempt.id,
      type: payment.type === PaymentType.DEPOSIT ? 'QR_DEPOSIT' : 'BANK_PAYOUT',
      amount: amount.toDecimalString(),
      currency: payment.currencyIso3,
    };

    if (payment.type === PaymentType.DEPOSIT) {
      return common;
    }

    return {
      ...common,
      bank_code: ALPHA_BANK_CODES.get(payment.bankId ?? ''),
      account_no: payment.accountNumber ?? undefined,
      account_name: payment.accountName ?? undefined,
    };
  }

  private createReply(result: HttpResult, type: PaymentType): CreateReply {
    const body =
      result.kind === 'response' ? readJsonObject(result.body) : null;

    if (
      result.kind === 'no-response' ||
      result.status !== 200 ||
      body === null
    ) {
      return this.unknownReply(body);
    }

    if (body.status === 'PENDING' && body.code === '00') {
      return {
        observation: {
          status: ProviderStatus.PENDING,
          cause: null,
          code: '00',
          message: null,
        },
        unclearReject: false,
        providerOrderId: readString(body.order_id),
        qrCode: readString(body.qr_string),
      };
    }

    if (body.status === 'REJECTED' && typeof body.code === 'string') {
      return this.rejectReply(body, type);
    }

    return this.unknownReply(body);
  }

  private rejectReply(
    body: Record<string, unknown>,
    type: PaymentType,
  ): CreateReply {
    const code = readString(body.code);
    const providerMessage = readString(body.message);
    const reject = ALPHA_CREATE_REJECTS[type].get(code ?? '') ?? {
      observation: { status: null, cause: null, code, message: null },
      unclearReject: true,
    };

    return {
      observation: {
        ...reject.observation,
        message: providerMessage ?? reject.observation.message,
      },
      unclearReject: reject.unclearReject,
      providerOrderId: null,
      qrCode: null,
    };
  }

  private unknownReply(body: Record<string, unknown> | null): CreateReply {
    return {
      observation: {
        status: null,
        cause: null,
        code: readString(body?.code),
        message: readString(body?.message),
      },
      unclearReject: false,
      providerOrderId: null,
      qrCode: null,
    };
  }

  private observation(body: Record<string, unknown>): Observation {
    const status = ALPHA_STATUSES.get(readString(body.status) ?? '') ?? null;
    const code = readString(body.code);
    const failureCause =
      ALPHA_FAILURE_CAUSES.get(code ?? '') ?? FailureCause.PROVIDER;

    return {
      status,
      cause: status === ProviderStatus.FAILED ? failureCause : null,
      code,
      message: null,
    };
  }
}
