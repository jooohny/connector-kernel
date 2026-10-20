import { createHmac } from 'node:crypto';

import {
  ConnectorName,
  FailureCause,
  PaymentType,
  ProviderStatus,
  SignatureStatus,
} from '../../../src/modules/payments/domain/shared/payment-enums';

import type { WebhookEnvelope } from '../../../src/modules/payments/domain/connector/connector.types';
import { AlphaConnector } from '../../../src/modules/payments/infrastructure/connectors/alpha/alpha.connector';
import { ALPHA_CREATE_REJECTS } from '../../../src/modules/payments/infrastructure/connectors/alpha/alpha.tables';
import type { AlphaConfig } from '../../../src/modules/payments/infrastructure/connectors/alpha/alpha.types';
import type { HttpResult } from '../../../src/modules/payments/infrastructure/connectors/http-client';
import {
  jsonResponse,
  ScriptedHttpClient,
  timeout,
} from '../../support/scripted-http-client';
import {
  depositFixture,
  paymentFixture,
  sendable,
} from '../../support/payment-fixtures';

const config: AlphaConfig = {
  baseUrl: 'https://alpha.invalid',
  apiKey: 'test-key',
  webhookSecret: 'test-secret',
  timeoutMs: 30000,
};
const withdrawal = paymentFixture();
const deposit = depositFixture();

function setup(results: HttpResult[]): {
  http: ScriptedHttpClient;
  connector: AlphaConnector;
} {
  const http = new ScriptedHttpClient(results);

  return { http, connector: new AlphaConnector(http, config) };
}

function envelope(body: unknown): WebhookEnvelope {
  return { headers: {}, rawBody: Buffer.from(JSON.stringify(body)) };
}

const unknownObservation = {
  status: null,
  cause: null,
  code: null,
  message: null,
};
const statuses = [
  { wire: 'PENDING', status: ProviderStatus.PENDING },
  { wire: 'PAID', status: ProviderStatus.SUCCEEDED },
  { wire: 'FAILED', status: ProviderStatus.FAILED },
  { wire: 'EXPIRED', status: ProviderStatus.EXPIRED },
  { wire: 'REFUNDED', status: ProviderStatus.RETURNED },
  { wire: 'PARTIALLY_PAID', status: null },
];

describe('AlphaConnector', () => {
  it('sends the payout request with exact decimal amount and mapped bank', async () => {
    const { connector, http } = setup([
      jsonResponse(200, { code: '00', status: 'PENDING' }),
    ]);

    const result = await connector.create(sendable(withdrawal));

    expect(connector.id).toBe(ConnectorName.ALPHA);
    expect(result.unclearReject).toBe(false);
    expect(result.observation).toEqual({
      ...unknownObservation,
      status: ProviderStatus.PENDING,
      code: '00',
    });
    expect(http.requests).toEqual([
      {
        method: 'POST',
        url: 'https://alpha.invalid/v2/orders',
        headers: {
          'X-Api-Key': 'test-key',
          'Content-Type': 'application/json',
        },
        timeoutMs: 30000,
        body: JSON.stringify({
          merchant_ref: 'attempt-1',
          type: 'BANK_PAYOUT',
          amount: '150000.00',
          currency: 'IDR',
          bank_code: '014',
          account_no: '123456',
          account_name: 'Test Recipient',
        }),
      },
    ]);
  });

  it('sends a deposit without bank fields and returns its QR and provider reference', async () => {
    const { connector, http } = setup([
      jsonResponse(200, {
        code: '00',
        status: 'PENDING',
        order_id: 'alpha-1',
        qr_string: 'qr-value',
      }),
    ]);

    const result = await connector.create(sendable(deposit));

    expect(result).toEqual({
      observation: {
        ...unknownObservation,
        status: ProviderStatus.PENDING,
        code: '00',
      },
      unclearReject: false,
      providerOrderId: 'alpha-1',
      qrCode: 'qr-value',
    });
    expect(JSON.parse(http.requests[0].body ?? '')).toEqual({
      merchant_ref: 'attempt-1',
      type: 'QR_DEPOSIT',
      amount: '150000.00',
      currency: 'IDR',
    });
  });

  it('preserves an amount whose floating-point form is inexact', async () => {
    const { connector, http } = setup([timeout()]);

    await connector.create(
      sendable({ ...deposit, amountMinor: 1000000000000000001n }),
    );

    expect(JSON.parse(http.requests[0].body ?? '')).toHaveProperty(
      'amount',
      '10000000000000000.01',
    );
  });

  describe.each([deposit, withdrawal])('$type create rejects', (order) => {
    it.each([...ALPHA_CREATE_REJECTS[order.type]])(
      'maps %s from its table',
      async (code, expected) => {
        const { connector } = setup([
          jsonResponse(200, { status: 'REJECTED', code }),
        ]);

        expect(expected).toMatchObject({
          observation: {
            status: code === '14' ? ProviderStatus.FAILED : null,
            cause: code === '14' ? FailureCause.CLIENT : null,
            code,
          },
          unclearReject: code !== '14',
        });
        expect(await connector.create(sendable(order))).toEqual({
          ...expected,
          providerOrderId: null,
          qrCode: null,
        });
      },
    );

    it('uses the provider message instead of the table message', async () => {
      const { connector } = setup([
        jsonResponse(200, {
          status: 'REJECTED',
          code: '14',
          message: 'Account closed',
        }),
      ]);

      expect(
        (await connector.create(sendable(order))).observation.message,
      ).toBe('Account closed');
    });

    it('keeps unknown reject NEW unresolved', async () => {
      const { connector } = setup([
        jsonResponse(200, {
          status: 'REJECTED',
          code: 'NEW',
          message: 'Unknown reject',
        }),
      ]);

      expect(await connector.create(sendable(order))).toEqual({
        observation: {
          ...unknownObservation,
          code: 'NEW',
          message: 'Unknown reject',
        },
        unclearReject: true,
        providerOrderId: null,
        qrCode: null,
      });
    });
  });

  it.each([
    {
      name: '409 DUP',
      response: jsonResponse(409, { code: 'DUP' }),
      code: 'DUP',
    },
    { name: '500', response: jsonResponse(500, { code: '96' }), code: '96' },
    { name: 'timeout', response: timeout(), code: null },
    {
      name: 'connection error',
      response: { kind: 'no-response' },
      code: null,
    },
    {
      name: 'non-JSON 200',
      response: { kind: 'response', status: 200, body: '<html>' },
      code: null,
    },
    ...[{ status: 'REJECTED' }, { status: 'PENDING', code: 0 }].map((body) => ({
      name: JSON.stringify(body),
      response: jsonResponse(200, body),
      code: null,
    })),
    {
      name: 'unexpected status',
      response: jsonResponse(200, { status: 'PAID', code: '00' }),
      code: '00',
    },
  ] satisfies { name: string; response: HttpResult; code: string | null }[])(
    'keeps create $name UNKNOWN without payment details',
    async ({ response, code }) => {
      const { connector } = setup([response]);

      expect(await connector.create(sendable(withdrawal))).toEqual({
        observation: { ...unknownObservation, code },
        unclearReject: false,
        providerOrderId: null,
        qrCode: null,
      });
    },
  );

  it.each([
    ...new Set(
      Object.values(ALPHA_CREATE_REJECTS).flatMap((rejects) => [
        ...rejects.keys(),
      ]),
    ),
  ])(
    'withdrawal is never less conservative than deposit for %s (ADR 0004)',
    (code) => {
      const depositOutcome =
        ALPHA_CREATE_REJECTS[PaymentType.DEPOSIT].get(code);
      const withdrawalOutcome =
        ALPHA_CREATE_REJECTS[PaymentType.WITHDRAWAL].get(code);

      expect(
        depositOutcome?.observation.status === null &&
          withdrawalOutcome?.observation.status === ProviderStatus.FAILED,
      ).toBe(false);
    },
  );

  it.each(['ID-BCA', 'ID-MANDIRI', 'ID-JAGO'])(
    'serves mapped bank %s',
    (bankId) => {
      expect(setup([]).connector.canServe({ ...withdrawal, bankId })).toBe(
        true,
      );
    },
  );

  it.each(['UNKNOWN', null])('does not serve bank %s', (bankId) => {
    expect(setup([]).connector.canServe({ ...withdrawal, bankId })).toBe(false);
  });

  it('serves deposits without a bank', () => {
    expect(setup([]).connector.canServe(deposit)).toBe(true);
  });

  it.each(statuses)('observes status $wire', async ({ wire, status }) => {
    const { connector, http } = setup([
      jsonResponse(200, { status: wire, code: '51' }),
    ]);

    const result = await connector.queryStatus(
      sendable(withdrawal, { id: 'attempt/a b' }),
    );

    expect(result).toEqual({
      kind: 'observed',
      observation: {
        status,
        cause: status === ProviderStatus.FAILED ? FailureCause.PROVIDER : null,
        code: '51',
        message: null,
      },
    });
    expect(http.requests).toEqual([
      {
        method: 'GET',
        url: 'https://alpha.invalid/v2/orders/attempt%2Fa%20b',
        headers: { 'X-Api-Key': 'test-key' },
        body: null,
        timeoutMs: 30000,
      },
    ]);
  });

  it.each([
    ['14', FailureCause.CLIENT],
    ['51', FailureCause.PROVIDER],
    ['NEW', FailureCause.PROVIDER],
    [null, FailureCause.PROVIDER],
  ])('attributes confirmed FAILED code %s to %s', async (code, cause) => {
    const { connector } = setup([
      jsonResponse(200, { status: 'FAILED', code }),
    ]);

    expect(await connector.queryStatus(sendable(withdrawal))).toEqual({
      kind: 'observed',
      observation: {
        status: ProviderStatus.FAILED,
        cause,
        code,
        message: null,
      },
    });
  });

  it.each([
    jsonResponse(404, {}),
    jsonResponse(500, {}),
    timeout(),
    { kind: 'response', status: 200, body: 'not-json' },
    jsonResponse(200, null),
  ] satisfies HttpResult[])(
    'returns no-information for unavailable status %#',
    async (response) => {
      const { connector } = setup([response]);

      expect(await connector.queryStatus(sendable(withdrawal))).toEqual({
        kind: 'no-information',
      });
    },
  );

  it('observes missing or non-string fields as null', async () => {
    const { connector } = setup([jsonResponse(200, { status: 1, code: 14 })]);

    expect(await connector.queryStatus(sendable(withdrawal))).toEqual({
      kind: 'observed',
      observation: { status: null, cause: null, code: null, message: null },
    });
  });

  it('verifies valid X-Alpha-Signature without timestamp expiry', () => {
    const rawBody = Buffer.from('{"event_id":"one"}');
    const signature = createHmac('sha256', config.webhookSecret)
      .update(rawBody)
      .digest('hex');

    expect(
      setup([]).connector.verifyWebhook({
        rawBody,
        headers: { 'X-Alpha-Signature': signature },
      }),
    ).toBe(SignatureStatus.VALID);
  });

  it.each([undefined, 'a'.repeat(63)])(
    'rejects malformed signature %s',
    (signature) => {
      expect(
        setup([]).connector.verifyWebhook({
          rawBody: Buffer.from('{}'),
          headers: { 'x-alpha-signature': signature },
        }),
      ).toBe(SignatureStatus.INVALID);
    },
  );

  it.each(['wrong secret', 'changed body'])('rejects %s', (scenario) => {
    const rawBody = Buffer.from('{"event_id":"one"}');
    const secret =
      scenario === 'wrong secret' ? 'wrong-secret' : config.webhookSecret;
    const signature = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const receivedBody =
      scenario === 'changed body' ? Buffer.from('{"event_id":"onf"}') : rawBody;

    expect(
      setup([]).connector.verifyWebhook({
        rawBody: receivedBody,
        headers: { 'x-alpha-signature': signature },
      }),
    ).toBe(SignatureStatus.INVALID);
  });

  it.each(statuses)(
    'parses webhook $wire and preserves payload',
    ({ wire, status }) => {
      const body = {
        event_id: 'event-1',
        merchant_ref: 'attempt-1',
        status: wire,
        code: '14',
        amount: '150000.00',
      };

      expect(setup([]).connector.parseWebhook(envelope(body))).toEqual({
        eventId: 'event-1',
        reference: 'attempt-1',
        rawType: wire,
        payload: body,
        observation: {
          status,
          cause: status === ProviderStatus.FAILED ? FailureCause.CLIENT : null,
          code: '14',
          message: null,
        },
      });
    },
  );

  it.each([{ event_id: 1 }, 'text'])(
    'rejects unrecognisable webhook %#',
    (body) => {
      expect(setup([]).connector.parseWebhook(envelope(body))).toBeNull();
    },
  );

  it('rejects malformed webhook JSON', () => {
    expect(
      setup([]).connector.parseWebhook({
        headers: {},
        rawBody: Buffer.from('{'),
      }),
    ).toBeNull();
  });

  it('keeps an identifiable webhook with missing fields', () => {
    expect(
      setup([]).connector.parseWebhook(envelope({ event_id: 'event-1' })),
    ).toEqual({
      eventId: 'event-1',
      reference: null,
      rawType: '',
      payload: { event_id: 'event-1' },
      observation: { status: null, cause: null, code: null, message: null },
    });
  });

  it.each([
    { ...withdrawal, bankId: null },
    { ...withdrawal, bankId: 'UNKNOWN' },
  ])('does not serve unsupported order %#', (order) => {
    const { connector, http } = setup([]);

    expect(connector.canServe(order)).toBe(false);
    expect(http.requests).toHaveLength(0);
  });
});
