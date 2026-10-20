import { createHmac } from 'node:crypto';

import {
  ConnectorName,
  FailureCause,
  ProviderStatus,
  SignatureStatus,
} from '../../../src/modules/payments/domain/shared/payment-enums';

import type { WebhookEnvelope } from '../../../src/modules/payments/domain/connector/connector.types';
import { BravoConnector } from '../../../src/modules/payments/infrastructure/connectors/bravo/bravo.connector';
import type { BravoConfig } from '../../../src/modules/payments/infrastructure/connectors/bravo/bravo.types';
import type { HttpResult } from '../../../src/modules/payments/infrastructure/connectors/http-client';
import {
  jsonResponse,
  ScriptedHttpClient,
  timeout,
} from '../../support/scripted-http-client';
import { paymentFixture, sendable } from '../../support/payment-fixtures';

const config: BravoConfig = {
  baseUrl: 'https://bravo.invalid',
  webhookSecret: 'test-secret',
  timeoutMs: 30000,
};
const withdrawal = paymentFixture();
const now = new Date('2026-10-18T00:00:00Z');

function setup(results: HttpResult[]): {
  http: ScriptedHttpClient;
  connector: BravoConnector;
} {
  const http = new ScriptedHttpClient(results);

  return { http, connector: new BravoConnector(http, config) };
}

function envelope(body: unknown): WebhookEnvelope {
  return { headers: {}, rawBody: Buffer.from(JSON.stringify(body)) };
}

function signed(offset = 0, secret = config.webhookSecret): WebhookEnvelope {
  const timestamp = String(now.getTime() / 1000 + offset);
  const rawBody = Buffer.from('{"id":"one"}');
  const signature = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
    .digest('base64');

  return {
    rawBody,
    headers: { 'Bravo-Timestamp': timestamp, 'Bravo-Signature': signature },
  };
}

describe('BravoConnector', () => {
  it('sends integer minor units and mapped BIC without auth', async () => {
    const { connector, http } = setup([
      jsonResponse(202, { payout_id: 'bravo-1', state: 'queued' }),
    ]);

    const reply = await connector.create(sendable(withdrawal));

    expect(connector.id).toBe(ConnectorName.BRAVO);
    expect(http.requests).toEqual([
      {
        method: 'POST',
        url: 'https://bravo.invalid/payouts',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 30000,
        body: JSON.stringify({
          reference: 'attempt-1',
          amount_minor: 15000000,
          currency: 'IDR',
          beneficiary: {
            bank_bic: 'CENAIDJA',
            account: '123456',
            name: 'Test Recipient',
          },
        }),
      },
    ]);
    expect(reply).toEqual({
      observation: {
        status: ProviderStatus.PENDING,
        cause: null,
        code: null,
        message: null,
      },
      unclearReject: false,
      providerOrderId: 'bravo-1',
      qrCode: null,
    });
  });

  it('accepts the original payout on DUPLICATE_REFERENCE', async () => {
    const { connector } = setup([
      jsonResponse(200, {
        payout_id: 'original',
        state: 'queued',
        warning: 'DUPLICATE_REFERENCE',
      }),
    ]);

    expect(await connector.create(sendable(withdrawal))).toMatchObject({
      providerOrderId: 'original',
      observation: { status: ProviderStatus.PENDING },
      unclearReject: false,
    });
  });

  it.each([
    {
      name: 'account validation',
      response: jsonResponse(400, {
        error: 'VALIDATION',
        field: 'beneficiary.account',
      }),
      status: ProviderStatus.FAILED,
      cause: FailureCause.CLIENT,
      code: 'VALIDATION',
      message: 'beneficiary.account',
      unclearReject: false,
    },
    {
      name: 'other validation',
      response: jsonResponse(400, { error: 'VALIDATION', field: 'currency' }),
      status: null,
      cause: null,
      code: 'VALIDATION',
      message: 'currency',
      unclearReject: true,
    },
    {
      name: 'insufficient balance',
      response: jsonResponse(422, { error: 'INSUFFICIENT_BALANCE' }),
      status: null,
      cause: null,
      code: 'INSUFFICIENT_BALANCE',
      message: null,
      unclearReject: true,
    },
    ...(
      [
        jsonResponse(500, {}),
        timeout(),
        { kind: 'response', status: 202, body: '<html>' },
        jsonResponse(202, {}),
        jsonResponse(200, { payout_id: 'unexpected' }),
      ] satisfies HttpResult[]
    ).map((response, index) => ({
      name: `unknown ${index}`,
      response,
      status: null,
      cause: null,
      code: null,
      message: null,
      unclearReject: false,
    })),
  ])(
    'maps $name',
    async ({ response, name, unclearReject, ...observation }) => {
      expect(name).toBeTruthy();
      const { connector } = setup([response]);

      expect(await connector.create(sendable(withdrawal))).toEqual({
        observation,
        unclearReject,
        providerOrderId: null,
        qrCode: null,
      });
    },
  );

  it.each(['ID-BCA', 'ID-MANDIRI'])('serves %s', (bankId) => {
    expect(setup([]).connector.canServe({ ...withdrawal, bankId })).toBe(true);
  });

  it('does not serve unsupported bank ID-JAGO', () => {
    const { connector, http } = setup([]);

    expect(connector.canServe({ ...withdrawal, bankId: 'ID-JAGO' })).toBe(
      false,
    );
    expect(http.requests).toHaveLength(0);
  });

  it('rejects unsafe JSON integers before sending', async () => {
    const { connector, http } = setup([]);

    await expect(
      connector.create(
        sendable({ ...withdrawal, amountMinor: 9007199254740992n }),
      ),
    ).rejects.toThrow('Monetary value exceeds the JSON safe-integer range');
    expect(http.requests).toHaveLength(0);
  });

  it('verifies valid signature at offset 300', () => {
    expect(setup([]).connector.verifyWebhook(signed(300), now)).toBe(
      SignatureStatus.VALID,
    );
  });

  it.each([-301, 301])(
    'rejects stale or future timestamp %s before signature',
    (offset) => {
      const event = signed(offset);

      expect(
        setup([]).connector.verifyWebhook(
          { ...event, headers: { ...event.headers, 'Bravo-Signature': 'bad' } },
          now,
        ),
      ).toBe(SignatureStatus.STALE);
    },
  );

  it.each([
    signed(0, 'wrong-secret'),
    { ...signed(), rawBody: Buffer.from('{"id":"onf"}') },
  ])('rejects invalid signature %#', (event) => {
    expect(setup([]).connector.verifyWebhook(event, now)).toBe(
      SignatureStatus.INVALID,
    );
  });

  it.each([
    ['payout.completed', ProviderStatus.SUCCEEDED],
    ['payout.failed', ProviderStatus.FAILED],
    ['payout.returned', ProviderStatus.RETURNED],
    ['unknown', null],
  ])('parses event %s', (type, status) => {
    const body = {
      id: 'event-1',
      type,
      created: 1,
      data: {
        payout_id: 'bravo-1',
        reference: 'attempt-1',
        failure_reason: 'ACCOUNT_CLOSED',
      },
    };

    expect(setup([]).connector.parseWebhook(envelope(body))).toEqual({
      eventId: 'event-1',
      reference: 'attempt-1',
      rawType: type,
      payload: body,
      observation: {
        status,
        cause: status === ProviderStatus.FAILED ? FailureCause.CLIENT : null,
        code: 'ACCOUNT_CLOSED',
        message: null,
      },
    });
  });

  it.each([
    ['ACCOUNT_CLOSED', FailureCause.CLIENT],
    ['INVALID_ACCOUNT', FailureCause.CLIENT],
    ['BANK_UNAVAILABLE', FailureCause.PROVIDER],
    ['SYSTEM_BUSY', FailureCause.PROVIDER],
    ['LIMIT_EXCEEDED', FailureCause.PROVIDER],
    ['NEW', FailureCause.PROVIDER],
  ])('attributes confirmed failure %s', (failure_reason, cause) => {
    expect(
      setup([]).connector.parseWebhook(
        envelope({
          id: 'one',
          type: 'payout.failed',
          data: { failure_reason },
        }),
      )?.observation,
    ).toEqual({
      status: ProviderStatus.FAILED,
      cause,
      code: failure_reason,
      message: null,
    });
  });

  it('rejects unidentifiable event with id 1', () => {
    expect(setup([]).connector.parseWebhook(envelope({ id: 1 }))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(
      setup([]).connector.parseWebhook({
        headers: {},
        rawBody: Buffer.from('{'),
      }),
    ).toBeNull();
  });

  it('keeps identifiable events with null data', () => {
    expect(
      setup([]).connector.parseWebhook(envelope({ id: 'one', data: null })),
    ).toMatchObject({
      eventId: 'one',
      reference: null,
      rawType: '',
      observation: { status: null, cause: null, code: null, message: null },
    });
  });
});
