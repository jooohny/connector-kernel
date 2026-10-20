import { randomUUID } from 'node:crypto';

import request, { type Test } from 'supertest';

import {
  ConflictException,
  GatewayValidationException,
} from '@core/exceptions';

import {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentStatus,
  ReviewReason,
  SignatureStatus,
} from '../../src/modules/payments/domain/shared/payment-enums';
import {
  PaymentEntity,
  ProviderEventEntity,
  ReviewRequestEntity,
  WebhookDeliveryEntity,
} from '../../src/modules/payments/infrastructure/persistence/entities';

import { ProcessWebhooksUseCase } from '../../src/modules/payments/application-services/workers/use-cases/process-webhooks.use-case';
import { RunStatusSweepUseCase } from '../../src/modules/payments/application-services/workers/use-cases/run-status-sweep.use-case';
import type { WebhookEnvelope } from '../../src/modules/payments/domain';
import type { HttpRequest } from '../../src/modules/payments/infrastructure/connectors/http-client';
import type { CreatedPaymentResponseDto } from '../../src/modules/payments/ui/http/payments/dtos/created-payment.response.dto';
import type { PaymentResponseDto } from '../../src/modules/payments/ui/http/payments/dtos/payment.response.dto';
import { DelegatingHttpClient } from '../support/delegating-http-client';
import {
  jsonResponse,
  ScriptedHttpClient,
  timeout,
} from '../support/scripted-http-client';
import { alphaWebhook } from '../support/signed-webhooks';
import {
  type E2eContext,
  resetDatabase,
  startE2eContext,
  stopE2eContext,
  TEST_PROVIDER_ENV,
} from './e2e-context';

const FIRST_CHECK_MS = 35_000;
const PAST_LIFETIME_MS = 16 * 60_000;

const DEPOSIT = {
  type: 'deposit',
  method: 'qr',
  amount: '150000.00',
  country: 'ID',
  currency: 'IDR',
};

const WITHDRAWAL = {
  type: 'withdrawal',
  method: 'bank_transfer',
  amount: '150000.00',
  country: 'ID',
  currency: 'IDR',
  bankId: 'ID-BCA',
  accountNumber: '1234567890',
  accountName: 'Budi Santoso',
};

const ALPHA_PENDING = jsonResponse(200, {
  code: '00',
  status: 'PENDING',
  order_id: 'A-1',
  qr_string: 'QR-DATA',
});
const ALPHA_REJECTED_91 = jsonResponse(200, {
  code: '91',
  status: 'REJECTED',
  message: 'Issuer or switch inoperative',
});
const ALPHA_REJECTED_14 = jsonResponse(200, {
  code: '14',
  status: 'REJECTED',
  message: 'Invalid account',
});
const ALPHA_STATUS_FAILED_91 = jsonResponse(200, {
  status: 'FAILED',
  code: '91',
});
const BRAVO_QUEUED = jsonResponse(202, { payout_id: 'B-1', state: 'queued' });

/** The attempt id we sent Alpha as merchant_ref. */
function merchantRef(sent: HttpRequest): string {
  const body: unknown = JSON.parse(sent.body ?? '{}');

  if (
    typeof body !== 'object' ||
    body === null ||
    !('merchant_ref' in body) ||
    typeof body.merchant_ref !== 'string'
  ) {
    throw new Error('Expected an Alpha create request');
  }

  return body.merchant_ref;
}

describe('Required scenarios over HTTP (e2e)', () => {
  const http = new DelegatingHttpClient();
  let context: E2eContext;
  let inbox: ProcessWebhooksUseCase;
  let sweep: RunStatusSweepUseCase;
  let keyNo = 0;

  beforeAll(async () => {
    context = await startE2eContext({ httpClient: http });
    inbox = context.app.get(ProcessWebhooksUseCase);
    sweep = context.app.get(RunStatusSweepUseCase);
  }, 120_000);
  beforeEach(async () => resetDatabase(context.dataSource));
  afterAll(async () => {
    if (context) {
      await stopE2eContext(context);
    }
  });

  function api() {
    return request(context.app.getHttpServer());
  }

  function createPayment(
    body: object,
    idempotencyKey = `key-${++keyNo}`,
  ): Test {
    return api()
      .post('/payments')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
  }

  /** Creates and expects 201. */
  async function created(
    body: object,
    idempotencyKey?: string,
  ): Promise<CreatedPaymentResponseDto> {
    const response = await createPayment(body, idempotencyKey).expect(201);

    return response.body as CreatedPaymentResponseDto;
  }

  async function getPayment(id: string): Promise<PaymentResponseDto> {
    const response = await api().get(`/payments/${id}`).expect(200);

    return response.body as PaymentResponseDto;
  }

  function postWebhook(connector: string, envelope: WebhookEnvelope): Test {
    return (
      api()
        .post(`/webhooks/${connector}`)
        .set('Content-Type', 'application/json')
        .set(envelope.headers)
        // A string goes out byte for byte; a Buffer with a JSON content type is re-serialised.
        .send(envelope.rawBody.toString('utf8'))
    );
  }

  function alphaEvent(
    attemptId: string,
    eventId: string,
    status: string,
    code = '00',
  ) {
    return alphaWebhook(
      {
        event_id: eventId,
        merchant_ref: attemptId,
        order_id: 'A-1',
        status,
        code,
        occurred_at: new Date().toISOString(),
      },
      TEST_PROVIDER_ENV.ALPHA_WEBHOOK_SECRET,
    );
  }

  it.each([
    {
      name: 'no Idempotency-Key header',
      body: DEPOSIT,
      idempotencyKey: undefined,
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.REQUIRED_STRING
      ],
      field: 'Idempotency-Key',
    },
    {
      name: 'withdrawal without bankId',
      body: { ...WITHDRAWAL, bankId: undefined },
      idempotencyKey: 'bank-key',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.REQUIRED_STRING
      ],
      field: 'bankId',
    },
    {
      name: 'lowercase currency',
      body: { ...DEPOSIT, currency: 'idr' },
      idempotencyKey: 'currency-key',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.INVALID_FORMAT
      ],
      field: 'currency',
    },
    {
      name: 'withdrawal with a 33-character bankId',
      body: { ...WITHDRAWAL, bankId: 'x'.repeat(33) },
      idempotencyKey: 'boundary-0',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.TOO_LONG
      ],
      field: 'bankId',
    },
    {
      name: 'withdrawal without accountName',
      body: { ...WITHDRAWAL, accountName: undefined },
      idempotencyKey: 'boundary-1',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.REQUIRED_STRING
      ],
      field: 'accountName',
    },
    {
      name: 'withdrawal with a blank accountName',
      body: { ...WITHDRAWAL, accountName: '   ' },
      idempotencyKey: 'boundary-2',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.REQUIRED_STRING
      ],
      field: 'accountName',
    },
    {
      name: 'numeric amount',
      body: { ...DEPOSIT, amount: 150000 },
      idempotencyKey: 'boundary-3',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.INVALID_FORMAT
      ],
      field: 'amount',
    },
    {
      name: 'unknown payment type',
      body: { ...DEPOSIT, type: 'refund' },
      idempotencyKey: 'boundary-4',
      code: GatewayValidationException.Code[
        GatewayValidationException.Message.MUST_BE_ONE_OF
      ],
      field: 'type',
    },
  ])(
    'rejects a malformed create at the boundary: $name',
    async ({ body, idempotencyKey, code, field }) => {
      const pending = api().post('/payments');

      if (typeof idempotencyKey === 'string') {
        pending.set('Idempotency-Key', idempotencyKey);
      }

      const response = await pending.send(body).expect(400);

      expect(response.body).toMatchObject({ code, field });
    },
  );

  it('rejects a payment body over 64 kB', async () => {
    await createPayment({
      ...WITHDRAWAL,
      accountName: 'x'.repeat(70_000),
    }).expect(413);
  });

  it('1. deposit happy path: QR returned, PAID webhook completes the payment', async () => {
    const alpha = http.use(new ScriptedHttpClient([ALPHA_PENDING]));

    const payment = await created(DEPOSIT);

    expect(payment).toEqual({
      id: payment.id,
      status: PaymentStatus.PROCESSING,
      qrCode: 'QR-DATA',
    });
    await postWebhook(
      'alpha',
      alphaEvent(merchantRef(alpha.requests[0]), 'evt-paid', 'PAID'),
    ).expect(200, { status: 'accepted' });
    await inbox.run(new Date());

    expect(await getPayment(payment.id)).toMatchObject({
      status: PaymentStatus.SUCCESS,
      amountMinor: '15000000',
      currency: 'IDR',
      attempts: [
        {
          attemptNo: 1,
          connector: ConnectorName.ALPHA,
          status: AttemptStatus.SUCCEEDED,
        },
      ],
    });
  });

  it('2. idempotent create: same key and body replays, a changed body conflicts, concurrent requests make one payment', async () => {
    const alpha = http.use(
      new ScriptedHttpClient([ALPHA_PENDING, ALPHA_PENDING]),
    );

    const first = await created(DEPOSIT, 'same-key');
    const replay = await created(DEPOSIT, 'same-key');
    const changed = await createPayment(
      { ...DEPOSIT, amount: '2.00' },
      'same-key',
    ).expect(409);

    expect(replay).toEqual(first);
    expect(changed.body).toMatchObject({
      code: ConflictException.Code[ConflictException.Message.PARAMS_MISMATCH],
    });
    expect(alpha.requests).toHaveLength(1);

    const concurrent = await Promise.all(
      Array.from({ length: 10 }, async () =>
        createPayment(DEPOSIT, 'concurrent-key'),
      ),
    );

    // Each loser either replays the stored result or is told the first send is in progress.
    for (const response of concurrent) {
      expect(
        response.status === 201 ||
          (response.body as { code: number }).code === 9001,
      ).toBeTruthy();
    }

    expect(
      await context.dataSource.manager.countBy(PaymentEntity, {
        idempotencyKey: 'concurrent-key',
      }),
    ).toBe(1);
    expect(alpha.requests).toHaveLength(2);
  });

  it('3. duplicate webhook: recorded twice, applied once', async () => {
    const alpha = http.use(new ScriptedHttpClient([ALPHA_PENDING]));
    const payment = await created(DEPOSIT);
    const paid = alphaEvent(merchantRef(alpha.requests[0]), 'evt-dup', 'PAID');

    await postWebhook('alpha', paid).expect(200);
    await postWebhook('alpha', paid).expect(200);
    await inbox.run(new Date());

    expect((await getPayment(payment.id)).status).toBe(PaymentStatus.SUCCESS);
    expect(await context.dataSource.manager.count(WebhookDeliveryEntity)).toBe(
      2,
    );
    expect(await context.dataSource.manager.count(ProviderEventEntity)).toBe(1);
  });

  it('duplicate webhook delivered concurrently: every delivery recorded, applied once', async () => {
    const alpha = http.use(new ScriptedHttpClient([ALPHA_PENDING]));
    const payment = await created(DEPOSIT);
    const paid = alphaEvent(
      merchantRef(alpha.requests[0]),
      'evt-concurrent',
      'PAID',
    );

    await Promise.all(
      Array.from({ length: 5 }, () => postWebhook('alpha', paid).expect(200)),
    );
    await inbox.run(new Date());

    expect((await getPayment(payment.id)).status).toBe(PaymentStatus.SUCCESS);
    expect(await context.dataSource.manager.count(WebhookDeliveryEntity)).toBe(
      5,
    );
    expect(await context.dataSource.manager.count(ProviderEventEntity)).toBe(1);
    expect(await context.dataSource.manager.count(ReviewRequestEntity)).toBe(0);
  });

  it('4. out-of-order webhook: an older FAILED after PAID keeps the payment successful', async () => {
    const alpha = http.use(new ScriptedHttpClient([ALPHA_PENDING]));
    const payment = await created(DEPOSIT);
    const attemptId = merchantRef(alpha.requests[0]);

    await postWebhook('alpha', alphaEvent(attemptId, 'evt-2', 'PAID')).expect(
      200,
    );
    await inbox.run(new Date());
    await postWebhook(
      'alpha',
      alphaEvent(attemptId, 'evt-1', 'FAILED', '91'),
    ).expect(200);
    await inbox.run(new Date());

    expect(await getPayment(payment.id)).toMatchObject({
      status: PaymentStatus.SUCCESS,
      attempts: [{ status: AttemptStatus.SUCCEEDED }],
    });
    expect(
      await context.dataSource.manager.findBy(ReviewRequestEntity, {
        paymentId: payment.id,
      }),
    ).toEqual([
      expect.objectContaining({ reason: ReviewReason.SUCCEEDED_THEN_FAILED }),
    ]);
  });

  it('5. withdrawal cascade: a confirmed provider-side failure moves to Bravo with BIC and minor units', async () => {
    const providers = http.use(
      new ScriptedHttpClient([
        ALPHA_REJECTED_91,
        ALPHA_STATUS_FAILED_91,
        BRAVO_QUEUED,
      ]),
    );
    const payment = await created(WITHDRAWAL);

    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));

    expect((await getPayment(payment.id)).attempts).toEqual([
      expect.objectContaining({
        connector: ConnectorName.ALPHA,
        status: AttemptStatus.FAILED,
        failureCause: FailureCause.PROVIDER,
      }),
      expect.objectContaining({
        attemptNo: 2,
        connector: ConnectorName.BRAVO,
        status: AttemptStatus.PENDING,
      }),
    ]);
    expect(JSON.parse(providers.requests[2].body ?? '{}')).toMatchObject({
      amount_minor: 15000000,
      currency: 'IDR',
      beneficiary: { bank_bic: 'CENAIDJA', account: '1234567890' },
    });
  });

  it('6. client-side decline: an invalid account declines without trying Bravo', async () => {
    const providers = http.use(new ScriptedHttpClient([ALPHA_REJECTED_14]));

    const payment = await created(WITHDRAWAL);

    expect(payment.status).toBe(PaymentStatus.DECLINED);
    expect(await getPayment(payment.id)).toMatchObject({
      status: PaymentStatus.DECLINED,
      declineReason: 'Invalid account',
      attempts: [
        { status: AttemptStatus.FAILED, failureCause: FailureCause.CLIENT },
      ],
    });
    expect(providers.requests).toHaveLength(1);
  });

  it('7. withdrawal timeout with status recovery: never re-sent, 404 waits, FAILED cascades', async () => {
    const providers = http.use(
      new ScriptedHttpClient([
        timeout(),
        jsonResponse(404, {}),
        ALPHA_STATUS_FAILED_91,
        BRAVO_QUEUED,
      ]),
    );
    const payment = await created(WITHDRAWAL);

    expect(payment.status).toBe(PaymentStatus.PROCESSING);
    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));
    expect((await getPayment(payment.id)).attempts).toEqual([
      expect.objectContaining({ status: AttemptStatus.UNKNOWN }),
    ]);

    await sweep.run(new Date(Date.now() + 5 * 60_000));

    expect((await getPayment(payment.id)).attempts).toEqual([
      expect.objectContaining({ status: AttemptStatus.FAILED }),
      expect.objectContaining({ connector: ConnectorName.BRAVO }),
    ]);
    expect(providers.requests.map(({ method }) => method)).toEqual([
      'POST',
      'GET',
      'GET',
      'POST',
    ]);
  });

  it('8. timeout without status recovery: Bravo stays unknown, the lifetime ends in one review, still processing', async () => {
    http.use(
      new ScriptedHttpClient([
        ALPHA_REJECTED_91,
        ALPHA_STATUS_FAILED_91,
        timeout(),
      ]),
    );
    const payment = await created(WITHDRAWAL);
    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));

    await sweep.run(new Date(Date.now() + PAST_LIFETIME_MS));
    await sweep.run(new Date(Date.now() + PAST_LIFETIME_MS + 60_000));

    expect(await getPayment(payment.id)).toMatchObject({
      status: PaymentStatus.PROCESSING,
      attempts: [
        { status: AttemptStatus.FAILED },
        { connector: ConnectorName.BRAVO, status: AttemptStatus.UNKNOWN },
      ],
    });
    expect(
      await context.dataSource.manager.findBy(ReviewRequestEntity, {
        paymentId: payment.id,
      }),
    ).toEqual([
      expect.objectContaining({
        reason: ReviewReason.LIFETIME_ENDED_UNRESOLVED,
        resolvedAt: null,
      }),
    ]);
  });

  it('9. unmatched webhook: acknowledged and queued for review; an unknown connector is 404', async () => {
    await postWebhook(
      'alpha',
      alphaEvent(randomUUID(), 'evt-stranger', 'PAID'),
    ).expect(200);

    expect(await context.dataSource.manager.find(ReviewRequestEntity)).toEqual([
      expect.objectContaining({
        reason: ReviewReason.UNMATCHED_EVENT,
        attemptId: null,
      }),
    ]);
    await postWebhook(
      'gamma',
      alphaEvent(randomUUID(), 'evt-nobody', 'PAID'),
    ).expect(404);
  });

  it('10. bad signature: rejected with 401, recorded, never applied', async () => {
    const alpha = http.use(new ScriptedHttpClient([ALPHA_PENDING]));
    const payment = await created(DEPOSIT);
    const forged = alphaEvent(
      merchantRef(alpha.requests[0]),
      'evt-forged',
      'PAID',
    );

    await postWebhook('alpha', {
      ...forged,
      headers: { 'x-alpha-signature': 'ab'.repeat(32) },
    }).expect(401);
    await inbox.run(new Date());

    expect((await getPayment(payment.id)).status).toBe(
      PaymentStatus.PROCESSING,
    );
    expect(
      await context.dataSource.manager.find(WebhookDeliveryEntity),
    ).toEqual([
      expect.objectContaining({
        signatureStatus: SignatureStatus.INVALID,
        rawBody: forged.rawBody,
      }),
    ]);
    expect(await context.dataSource.manager.count(ProviderEventEntity)).toBe(0);
  });

  it('a webhook body that is not JSON is still recorded byte for byte', async () => {
    await api()
      .post('/webhooks/alpha')
      .set('Content-Type', 'application/json')
      .set('X-Alpha-Signature', 'ab'.repeat(32))
      .send('{not json')
      .expect(401);

    expect(
      await context.dataSource.manager.find(WebhookDeliveryEntity),
    ).toEqual([expect.objectContaining({ rawBody: Buffer.from('{not json') })]);
  });
});
