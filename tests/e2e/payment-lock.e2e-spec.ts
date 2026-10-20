import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import {
  ConnectorName,
  PaymentMethod,
  PaymentType,
  ProviderStatus,
  SignatureStatus,
} from '../../src/modules/payments/domain/shared/payment-enums';

import {
  ATTEMPT_REPOSITORY,
  PAYMENT_REPOSITORY,
  PROVIDER_EVENT_REPOSITORY,
  WEBHOOK_DELIVERY_REPOSITORY,
} from '../../src/modules/payments/domain';
import type {
  AttemptRepository,
  Attempt,
  ProviderEvent,
  With,
  PaymentRepository,
  ProviderEventRepository,
  WebhookDeliveryRepository,
} from '../../src/modules/payments/domain';
import { PaymentTransaction } from '../../src/modules/payments/infrastructure/persistence/payment-transaction';
import { eventRow } from '../support/payment-fixtures';
import type { ParsedEvent } from '../support/payment-fixtures';
import {
  type E2eContext,
  resetDatabase,
  startE2eContext,
  stopE2eContext,
} from './e2e-context';

function signal(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { promise, release };
}

async function within<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Operation did not finish before lock release')),
      milliseconds,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

describe('Payment locking (e2e)', () => {
  let context: E2eContext;
  let payments: PaymentRepository;
  let events: ProviderEventRepository;
  let deliveries: WebhookDeliveryRepository;
  let attempts: AttemptRepository;
  let order: With<Attempt, 'payment'>;

  beforeAll(async () => {
    context = await startE2eContext();
    payments = context.app.get(PAYMENT_REPOSITORY);
    events = context.app.get(PROVIDER_EVENT_REPOSITORY);
    deliveries = context.app.get(WEBHOOK_DELIVERY_REPOSITORY);
    attempts = context.app.get(ATTEMPT_REPOSITORY);
  }, 120_000);
  beforeEach(async () => {
    await resetDatabase(context.dataSource);
    const result = await payments.insertOrIgnoreByIdempotencyKey(
      {
        idempotencyKey: randomUUID(),
        type: PaymentType.DEPOSIT,
        method: PaymentMethod.QR,
        amountMinor: 100n,
        countryIso2: 'ID',
        currencyIso3: 'IDR',
        bankId: null,
        accountNumber: null,
        accountName: null,
        lifetimeEndsAt: new Date('2026-10-18T12:15:00Z'),
      },
      async (lock) => ({
        ...(await attempts.insertOne(
          { attemptNo: 1, connector: ConnectorName.ALPHA, nextCheckAt: null },
          lock,
        )),
        payment: lock.payment,
      }),
    );

    if (result === null) {
      throw new Error('Expected a fresh payment');
    }

    order = result;
  });
  afterAll(async () => {
    if (context) {
      await stopE2eContext(context);
    }
  });

  async function waitForBlockedSession(pid: number): Promise<void> {
    const deadline = Date.now() + 2000;

    while (Date.now() < deadline) {
      const rows = await context.dataSource.query<{ blocked: boolean }[]>(
        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))) AS blocked',
        [pid],
      );

      if (rows[0].blocked) {
        return;
      }

      await delay(10);
    }

    throw new Error('The second connection never waited on the payment lock');
  }

  it('a busy payment is skipped and a normal lock waits until the holder finishes', async () => {
    const acquired = signal();
    const release = signal();
    const ordering: string[] = [];
    let holderPid = 0;
    const holder = payments.lock(order.paymentId, async (lock) => {
      const rows = await PaymentTransaction.managerOf(lock).query<
        { pid: number }[]
      >('SELECT pg_backend_pid() AS pid');
      holderPid = rows[0].pid;
      ordering.push('A acquired');
      acquired.release();
      await release.promise;
      ordering.push('A finished');
    });
    const holderReady = Promise.race([acquired.promise, holder]);
    let waiter: Promise<void> | undefined;

    const verifyContention = async (): Promise<void> => {
      await within(holderReady, 2000);
      expect(
        await payments.lockOrSkip(order.paymentId, async () =>
          Promise.resolve('unexpected'),
        ),
      ).toBeNull();
      waiter = payments.lock(order.paymentId, async () => {
        ordering.push('B acquired');

        return Promise.resolve();
      });
      await waitForBlockedSession(holderPid);
      expect(ordering).toEqual(['A acquired']);
    };

    await verifyContention().finally(async () => {
      release.release();
      await Promise.all([holder, waiter]);
    });

    expect(ordering).toEqual(['A acquired', 'A finished', 'B acquired']);
  });

  it('matched webhook ingress completes on another connection before the payment lock is released', async () => {
    const acquired = signal();
    const release = signal();
    const holder = payments.lock(order.paymentId, async () => {
      acquired.release();
      await release.promise;
    });
    let recording: Promise<ProviderEvent | null> | undefined;
    const event: Omit<ParsedEvent, 'deliveryId'> = {
      connector: ConnectorName.ALPHA,
      eventId: randomUUID(),
      reference: order.id,
      rawType: 'paid',
      observation: {
        status: ProviderStatus.SUCCEEDED,
        cause: null,
        code: 'PAID',
        message: null,
      },
      payload: {},
      receivedAt: new Date('2026-10-18T12:00:00Z'),
    };

    const verifyIngress = async (): Promise<void> => {
      await within(Promise.race([acquired.promise, holder]), 2000);
      const delivery = await deliveries.insertOne({
        connector: event.connector,
        headers: {},
        rawBody: Buffer.from('{}'),
        signatureStatus: SignatureStatus.VALID,
        eventId: event.eventId,
        receivedAt: event.receivedAt,
      });
      const attempt = await attempts.getByReference(
        event.connector,
        event.reference,
      );
      recording = events.insertOneOrIgnore(
        ...eventRow({ ...event, deliveryId: delivery.id }, attempt),
      );
      // ADR 0003: this deadline fails if ingress waits for the held payment lock.
      expect(await within(recording, 1000)).toMatchObject({
        eventId: event.eventId,
      });
    };

    await verifyIngress().finally(async () => {
      release.release();
      await Promise.all([holder, recording]);
    });
  });
});
