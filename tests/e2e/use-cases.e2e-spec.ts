import { setTimeout as sleep } from 'node:timers/promises';

import {
  AttemptStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ReviewReason,
} from '../../src/modules/payments/domain/shared/payment-enums';
import {
  PaymentAttemptEntity,
  ProviderEventEntity,
  ReviewRequestEntity,
  WebhookDeliveryEntity,
} from '../../src/modules/payments/infrastructure/persistence/entities';

import { PAYMENTS_SERVICE } from '../../src/modules/payments/application-services/payments/payments.service.types';
import {
  WebhookOutcome,
  WEBHOOKS_SERVICE,
} from '../../src/modules/payments/application-services/webhooks/webhooks.service.types';
import type { WebhooksService } from '../../src/modules/payments/application-services/webhooks/webhooks.service.types';
import { ProcessWebhooksUseCase } from '../../src/modules/payments/application-services/workers/use-cases/process-webhooks.use-case';
import { RunStatusSweepUseCase } from '../../src/modules/payments/application-services/workers/use-cases/run-status-sweep.use-case';
import type {
  PaymentRequest,
  PaymentsService,
} from '../../src/modules/payments/application-services/payments/payments.service.types';
import type {
  HttpClient,
  HttpRequest,
  HttpResult,
} from '../../src/modules/payments/infrastructure/connectors/http-client';
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

const DEPOSIT: PaymentRequest = {
  type: PaymentType.DEPOSIT,
  method: PaymentMethod.QR,
  amount: '150000.00',
  countryIso2: 'ID',
  currencyIso3: 'IDR',
  bankId: null,
  accountNumber: null,
  accountName: null,
};

const WITHDRAWAL: PaymentRequest = {
  type: PaymentType.WITHDRAWAL,
  method: PaymentMethod.BANK_TRANSFER,
  amount: '150000.00',
  countryIso2: 'ID',
  currencyIso3: 'IDR',
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
const ALPHA_STATUS_FAILED_91 = jsonResponse(200, {
  status: 'FAILED',
  code: '91',
});
const BRAVO_QUEUED = jsonResponse(202, { payout_id: 'B-1', state: 'queued' });

function merchantRef(request: HttpRequest): string {
  const body: unknown = JSON.parse(request.body ?? '{}');

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

describe('Payment use cases (e2e)', () => {
  const http = new DelegatingHttpClient();
  let context: E2eContext;
  let service: PaymentsService;
  let webhooks: WebhooksService;
  let inbox: ProcessWebhooksUseCase;
  let sweep: RunStatusSweepUseCase;
  let keyNo = 0;

  beforeAll(async () => {
    context = await startE2eContext({ httpClient: http });
    service = context.app.get(PAYMENTS_SERVICE);
    webhooks = context.app.get(WEBHOOKS_SERVICE);
    inbox = context.app.get(ProcessWebhooksUseCase);
    sweep = context.app.get(RunStatusSweepUseCase);
  }, 120_000);
  beforeEach(async () => resetDatabase(context.dataSource));
  afterAll(async () => {
    if (context) {
      await stopE2eContext(context);
    }
  });

  async function create(
    request: PaymentRequest,
    idempotencyKey = `key-${++keyNo}`,
  ) {
    return service.create({ idempotencyKey, request });
  }

  function paidWebhook(attemptId: string, eventId: string) {
    return alphaWebhook(
      {
        event_id: eventId,
        merchant_ref: attemptId,
        order_id: 'A-1',
        status: 'PAID',
        code: '00',
      },
      TEST_PROVIDER_ENV.ALPHA_WEBHOOK_SECRET,
    );
  }

  it.each(['webhook', 'sweep'])(
    '%s reports preserve the provider order ID and returned QR flag',
    async (source) => {
      const scripted = http.use(
        new ScriptedHttpClient([
          ALPHA_PENDING,
          jsonResponse(200, { status: 'PAID', code: '00' }),
        ]),
      );
      const created = await create(DEPOSIT);
      const attemptId = merchantRef(scripted.requests[0]);

      if (source === 'webhook') {
        const verified = await webhooks.verify({
          connector: 'alpha',
          envelope: paidWebhook(attemptId, 'preserve-details'),
        });
        expect(verified.outcome).toBe(WebhookOutcome.ACCEPTED);

        if (verified.outcome === WebhookOutcome.ACCEPTED) {
          await webhooks.record(verified.webhook);
        }

        await inbox.run(new Date());
      } else {
        await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));
      }

      expect(
        await context.dataSource.manager.findOneByOrFail(PaymentAttemptEntity, {
          id: attemptId,
        }),
      ).toMatchObject({
        status: AttemptStatus.SUCCEEDED,
        providerOrderId: 'A-1',
        detailsReturned: true,
      });
      expect((await service.get(created.id)).status).toBe(
        PaymentStatus.SUCCESS,
      );
    },
  );

  it('a repeated key while the first send is in progress returns REQUEST_IN_PROGRESS with the payment id', async () => {
    let inProgress: unknown = null;
    const inFlight: HttpClient = {
      send: async (): Promise<HttpResult> => {
        inProgress = await create(DEPOSIT, 'in-progress-key').catch(
          (error: unknown) => error,
        );

        return ALPHA_PENDING;
      },
    };
    http.use(inFlight);

    const first = await create(DEPOSIT, 'in-progress-key');

    expect(inProgress).toMatchObject({ code: 9001, resourceId: first.id });
    expect(await create(DEPOSIT, 'in-progress-key')).toEqual(first);
  });

  it('a create replay preserves the original result after the payment succeeds', async () => {
    const scripted = http.use(new ScriptedHttpClient([ALPHA_PENDING]));
    const first = await create(DEPOSIT, 'snapshot-key');
    const verified = await webhooks.verify({
      connector: 'alpha',
      envelope: paidWebhook(
        merchantRef(scripted.requests[0]),
        'snapshot-event',
      ),
    });
    expect(verified.outcome).toBe(WebhookOutcome.ACCEPTED);

    if (verified.outcome === WebhookOutcome.ACCEPTED) {
      await webhooks.record(verified.webhook);
    }

    await inbox.run(new Date());

    expect((await service.get(first.id)).status).toBe(PaymentStatus.SUCCESS);
    expect(
      await create({ ...DEPOSIT, amount: '150000' }, 'snapshot-key'),
    ).toEqual(first);
    expect(scripted.requests).toHaveLength(1);
  });

  it('a reused withdrawal key with accountNumber 987654321 conflicts', async () => {
    const scripted = http.use(new ScriptedHttpClient([timeout()]));
    const key = `different-details-${++keyNo}`;
    await create(WITHDRAWAL, key);

    await expect(
      create({ ...WITHDRAWAL, accountNumber: '987654321' }, key),
    ).rejects.toMatchObject({ code: 9000 });
    expect(scripted.requests).toHaveLength(1);
  });

  it('accepts a signed unparseable delivery without an event', async () => {
    const envelope = alphaWebhook(
      { unrecognised: true },
      TEST_PROVIDER_ENV.ALPHA_WEBHOOK_SECRET,
    );

    const verified = await webhooks.verify({ connector: 'alpha', envelope });
    expect(verified.outcome).toBe(WebhookOutcome.ACCEPTED);

    if (verified.outcome === WebhookOutcome.ACCEPTED) {
      await webhooks.record(verified.webhook);
    }
    expect(await context.dataSource.manager.count(WebhookDeliveryEntity)).toBe(
      1,
    );
    expect(await context.dataSource.manager.count(ProviderEventEntity)).toBe(0);
  });

  it('a status query that closes the attempt clears its next check', async () => {
    http.use(
      new ScriptedHttpClient([
        ALPHA_REJECTED_91,
        ALPHA_STATUS_FAILED_91,
        BRAVO_QUEUED,
      ]),
    );
    const created = await create(WITHDRAWAL);

    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));

    const [row] = await context.dataSource.query<
      { status: string; next_check_at: Date | null }[]
    >(
      'SELECT status, next_check_at FROM payment_attempts WHERE payment_id = $1 AND attempt_no = 1',
      [created.id],
    );
    expect(row).toEqual({ status: AttemptStatus.FAILED, next_check_at: null });
  });

  it('a webhook that arrives before the create reply wins; the later PENDING reply only adds its QR flag', async () => {
    const early: HttpClient = {
      send: async (request: HttpRequest): Promise<HttpResult> => {
        const verified = await webhooks.verify({
          connector: 'alpha',
          envelope: paidWebhook(merchantRef(request), 'evt-early'),
        });
        expect(verified.outcome).toBe(WebhookOutcome.ACCEPTED);

        if (verified.outcome === WebhookOutcome.ACCEPTED) {
          await webhooks.record(verified.webhook);
        }

        await inbox.run(new Date());

        return ALPHA_PENDING;
      },
    };
    http.use(early);

    const created = await create(DEPOSIT);

    expect(created).toEqual({
      id: created.id,
      status: PaymentStatus.SUCCESS,
      qrCode: 'QR-DATA',
    });
    expect(
      await context.dataSource.manager.findOneByOrFail(PaymentAttemptEntity, {
        paymentId: created.id,
      }),
    ).toMatchObject({ status: AttemptStatus.SUCCEEDED, detailsReturned: true });
  });

  it('the sweep reads the clock after each status query: a failure confirmed after the lifetime declines', async () => {
    const scripted = new ScriptedHttpClient([
      ALPHA_REJECTED_91,
      ALPHA_STATUS_FAILED_91,
      BRAVO_QUEUED,
    ]);
    http.use({
      send: async (request: HttpRequest): Promise<HttpResult> => {
        if (scripted.requests.length === 1) {
          await sleep(50);
        }

        return scripted.send(request);
      },
    });
    const created = await create(WITHDRAWAL);
    const [{ lifetime_ends_at: lifetimeEndsAt }] =
      await context.dataSource.query<{ lifetime_ends_at: Date }[]>(
        'SELECT lifetime_ends_at FROM payments WHERE id = $1',
        [created.id],
      );

    await sweep.run(new Date(lifetimeEndsAt.getTime() - 10));

    expect((await service.get(created.id)).status).toBe(PaymentStatus.DECLINED);
    expect(scripted.requests).toHaveLength(2);
  });

  it('an unclear Bravo reject raises UNCONFIRMED_REJECT at once', async () => {
    http.use(
      new ScriptedHttpClient([
        ALPHA_REJECTED_91,
        ALPHA_STATUS_FAILED_91,
        jsonResponse(422, { error: 'INSUFFICIENT_BALANCE' }),
      ]),
    );
    const created = await create(WITHDRAWAL);

    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));

    expect(
      await context.dataSource.manager.find(ReviewRequestEntity, {
        where: { paymentId: created.id },
      }),
    ).toEqual([
      expect.objectContaining({
        reason: ReviewReason.UNCONFIRMED_REJECT,
        resolvedAt: null,
      }),
    ]);
    expect(await service.get(created.id)).toMatchObject({
      status: PaymentStatus.PROCESSING,
    });
  });

  it('a JAGO withdrawal never reaches Bravo: a provider-side failure declines', async () => {
    const scripted = http.use(
      new ScriptedHttpClient([ALPHA_REJECTED_91, ALPHA_STATUS_FAILED_91]),
    );
    const created = await create({ ...WITHDRAWAL, bankId: 'ID-JAGO' });

    await sweep.run(new Date(Date.now() + FIRST_CHECK_MS));

    expect(await service.get(created.id)).toMatchObject({
      status: PaymentStatus.DECLINED,
      declineReason: '91',
    });
    expect(scripted.requests).toHaveLength(2);
  });

  it('rejects an amount with too many decimals and a payment no connector serves', async () => {
    await expect(create({ ...DEPOSIT, amount: '1.001' })).rejects.toMatchObject(
      { code: 2001 },
    );
    await expect(
      create({ ...DEPOSIT, countryIso2: 'TH' }),
    ).rejects.toMatchObject({ code: 2002 });
  });
});
