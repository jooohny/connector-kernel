import { randomUUID } from 'node:crypto';

import {
  AttemptStatus,
  ConnectorName,
  EventResult,
  FailureCause,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ProviderStatus,
  ResolvedBy,
  ReviewReason,
  SignatureStatus,
} from '../../src/modules/payments/domain/shared/payment-enums';
import {
  PaymentAttemptEntity,
  PaymentEntity,
  ProviderEventEntity,
  ReviewRequestEntity,
  WebhookDeliveryEntity,
} from '../../src/modules/payments/infrastructure/persistence/entities';
import { DatabaseException } from '@core/exceptions';

import {
  ATTEMPT_REPOSITORY,
  PAYMENT_REPOSITORY,
  PROVIDER_EVENT_REPOSITORY,
  REVIEW_REPOSITORY,
  WEBHOOK_DELIVERY_REPOSITORY,
} from '../../src/modules/payments/domain';
import type {
  Attempt,
  AttemptRepository,
  AttemptUpdate,
  NewAttempt,
  NewPayment,
  PaymentLock,
  PaymentRepository,
  ProviderEvent,
  ProviderEventRepository,
  ReviewRepository,
  WebhookDelivery,
  WebhookDeliveryRepository,
  With,
} from '../../src/modules/payments/domain';
import { eventRow } from '../support/payment-fixtures';
import type { ParsedEvent } from '../support/payment-fixtures';
import {
  type E2eContext,
  resetDatabase,
  startE2eContext,
  stopE2eContext,
} from './e2e-context';

const NOW = new Date('2026-10-18T12:00:00Z');
const LATER = new Date('2026-10-18T12:15:00Z');
const FIRST_ATTEMPT: NewAttempt = {
  attemptNo: 1,
  connector: ConnectorName.ALPHA,
  nextCheckAt: NOW,
};

function newPayment(overrides: Partial<NewPayment> = {}): NewPayment {
  return {
    idempotencyKey: randomUUID(),
    type: PaymentType.DEPOSIT,
    method: PaymentMethod.QR,
    amountMinor: 9007199254740993n,
    countryIso2: 'ID',
    currencyIso3: 'IDR',
    bankId: null,
    accountNumber: null,
    accountName: null,
    lifetimeEndsAt: LATER,
    ...overrides,
  };
}

function pendingUpdate(
  attemptId: string,
  overrides: Partial<AttemptUpdate> = {},
): AttemptUpdate {
  return {
    id: attemptId,
    change: {
      from: AttemptStatus.UNKNOWN,
      status: AttemptStatus.PENDING,
      failureCause: null,
    },
    providerCode: null,
    providerMessage: null,
    providerOrderId: null,
    detailsReturned: false,
    ...overrides,
  };
}

type EventInput = Omit<ParsedEvent, 'deliveryId'>;

function newEvent(
  reference: string | null,
  overrides: Partial<EventInput> = {},
): EventInput {
  return {
    connector: ConnectorName.ALPHA,
    eventId: randomUUID(),
    reference,
    rawType: 'failed',
    observation: {
      status: ProviderStatus.FAILED,
      cause: FailureCause.PROVIDER,
      code: 'DOWN',
      message: 'Unavailable',
    },
    payload: { raw: true },
    receivedAt: NOW,
    ...overrides,
  };
}

function delivery(event: EventInput): Omit<WebhookDelivery, 'id'> {
  return {
    connector: event.connector,
    headers: { signature: 'fixture' },
    rawBody: Buffer.from('{"raw":true}'),
    signatureStatus: SignatureStatus.VALID,
    eventId: event.eventId,
    receivedAt: event.receivedAt,
  };
}

describe('Payments persistence (e2e)', () => {
  let context: E2eContext;
  let payments: PaymentRepository;
  let attempts: AttemptRepository;
  let reviews: ReviewRepository;
  let events: ProviderEventRepository;
  let deliveries: WebhookDeliveryRepository;

  beforeAll(async () => {
    context = await startE2eContext();
    payments = context.app.get(PAYMENT_REPOSITORY);
    attempts = context.app.get(ATTEMPT_REPOSITORY);
    reviews = context.app.get(REVIEW_REPOSITORY);
    events = context.app.get(PROVIDER_EVENT_REPOSITORY);
    deliveries = context.app.get(WEBHOOK_DELIVERY_REPOSITORY);
  }, 120_000);
  beforeEach(async () => resetDatabase(context.dataSource));
  afterAll(async () => {
    if (context) {
      await stopE2eContext(context);
    }
  });

  async function insertFirst(
    payment: NewPayment,
    firstAttempt: NewAttempt = FIRST_ATTEMPT,
  ): Promise<With<Attempt, 'payment'> | null> {
    return payments.insertOrIgnoreByIdempotencyKey(payment, async (lock) => ({
      ...(await attempts.insertOne(firstAttempt, lock)),
      payment: lock.payment,
    }));
  }

  async function create(
    overrides: Partial<NewPayment> = {},
    firstAttempt: NewAttempt = FIRST_ATTEMPT,
  ): Promise<With<Attempt, 'payment'>> {
    const result = await insertFirst(newPayment(overrides), firstAttempt);

    if (result === null) {
      throw new Error('Expected a fresh payment');
    }

    return result;
  }

  async function record(event: EventInput): Promise<ProviderEvent | null> {
    const stored = await deliveries.insertOne(delivery(event));
    const attempt = await attempts.getByReference(
      event.connector,
      event.reference,
    );

    return events.insertOneOrIgnore(
      ...eventRow({ ...event, deliveryId: stored.id }, attempt),
    );
  }

  it('concurrent creates with the same key insert one payment and one attempt', async () => {
    const input = newPayment();

    const results = await Promise.all([insertFirst(input), insertFirst(input)]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(results.filter((result) => result === null)).toHaveLength(1);
    expect(await context.dataSource.manager.count(PaymentEntity)).toBe(1);
    expect(await context.dataSource.manager.count(PaymentAttemptEntity)).toBe(
      1,
    );
  });

  it('lost race: a second update from UNKNOWN throws ROW_CHANGED_OUTSIDE_LOCK', async () => {
    const order = await create();

    await payments.lock(order.paymentId, async (lock) => {
      expect((await attempts.getOne(order.id, lock)).status).toBe(
        AttemptStatus.UNKNOWN,
      );
      await attempts.updateStatus(pendingUpdate(order.id), lock);
      await expect(
        attempts.updateStatus(pendingUpdate(order.id), lock),
      ).rejects.toMatchObject({ code: 1004 });
    });
  });

  it('getOne rejects an attempt belonging to another locked payment', async () => {
    const first = await create();
    const second = await create();

    await payments.lock(first.paymentId, async (lock) => {
      await expect(attempts.getOne(second.id, lock)).rejects.toMatchObject({
        code: 1005,
      });
      await expect(
        attempts.updateNextCheckAt({ id: second.id, nextCheckAt: NOW }, lock),
      ).rejects.toMatchObject({ code: 1005 });
    });
  });

  it('rejects a lock kept after lock resolved', async () => {
    const order = await create();
    const lock: PaymentLock = await payments.lock(
      order.paymentId,
      async (held) => Promise.resolve(held),
    );

    await expect(attempts.getOne(order.id, lock)).rejects.toMatchObject({
      code: 1003,
    });
  });

  it('detailsReturned starts false, becomes true, and cannot be reset', async () => {
    const order = await create();

    await payments.lock(order.paymentId, async (lock) => {
      expect((await attempts.getOne(order.id, lock)).detailsReturned).toBe(
        false,
      );
      await attempts.updateStatus(
        pendingUpdate(order.id, { detailsReturned: true }),
        lock,
      );
      expect((await attempts.getOne(order.id, lock)).detailsReturned).toBe(
        true,
      );
      await attempts.updateStatus(
        pendingUpdate(order.id, {
          change: {
            from: AttemptStatus.PENDING,
            status: AttemptStatus.SUCCEEDED,
            failureCause: null,
          },
        }),
        lock,
      );
      expect((await attempts.getOne(order.id, lock)).detailsReturned).toBe(
        true,
      );
    });
  });

  it('insertOne is idempotent and SYSTEM resolves only the two system review reasons', async () => {
    const order = await create();
    await payments.lock(order.paymentId, async (lock) => {
      expect(await reviews.hasOpen(lock)).toBe(false);
      const review = {
        attemptId: order.id,
        reason: ReviewReason.UNCONFIRMED_REJECT,
        providerEventId: null,
        raisedAt: NOW,
      };
      expect(await reviews.insertOne(review, lock)).toMatchObject(review);
      expect(await reviews.insertOne(review, lock)).toBeNull();
      await reviews.insertOne(
        { ...review, reason: ReviewReason.LIFETIME_ENDED_UNRESOLVED },
        lock,
      );
      await reviews.insertOne(
        { ...review, reason: ReviewReason.SUCCEEDED_THEN_FAILED },
        lock,
      );
      await reviews.updateSystemResolved(order.id, LATER, lock);
      expect(await reviews.hasOpen(lock)).toBe(true);
    });

    const rows = await context.dataSource.manager.find(ReviewRequestEntity, {
      order: { reason: 'ASC' },
    });
    expect(rows.filter((row) => row.resolvedAt !== null)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: ReviewReason.UNCONFIRMED_REJECT,
          resolvedBy: ResolvedBy.SYSTEM,
          resolvedAt: LATER,
        }),
        expect.objectContaining({
          reason: ReviewReason.LIFETIME_ENDED_UNRESOLVED,
          resolvedBy: ResolvedBy.SYSTEM,
          resolvedAt: LATER,
        }),
      ]),
    );
    expect(rows.filter((row) => row.resolvedAt === null)).toEqual([
      expect.objectContaining({ reason: ReviewReason.SUCCEEDED_THEN_FAILED }),
    ]);
  });

  it('a resolved review allows a new open review with the same attempt and reason', async () => {
    const order = await create();
    const review = {
      attemptId: order.id,
      reason: ReviewReason.UNCONFIRMED_REJECT,
      providerEventId: null,
      raisedAt: NOW,
    };

    await payments.lock(order.paymentId, async (lock) => {
      const original = await reviews.insertOne(review, lock);
      expect(original).not.toBeNull();
      expect(await reviews.insertOne(review, lock)).toBeNull();
      await reviews.updateSystemResolved(order.id, LATER, lock);
      const reopened = await reviews.insertOne(
        { ...review, raisedAt: LATER },
        lock,
      );

      expect(reopened).not.toBeNull();
      expect(reopened).not.toBe(original);
      expect(await reviews.insertOne(review, lock)).toBeNull();
    });
    expect(await context.dataSource.manager.count(ReviewRequestEntity)).toBe(2);
  });

  it('updateStatus decline stores the reason and a second settlement throws', async () => {
    const order = await create();
    await payments.lock(order.paymentId, async (lock) => {
      await payments.updateStatus(
        { kind: 'decline', reason: 'Declined by provider' },
        lock,
      );
      await expect(
        payments.updateStatus(
          { kind: 'complete', status: PaymentStatus.SUCCESS },
          lock,
        ),
      ).rejects.toMatchObject({ code: 1004 });
    });

    expect(await payments.getOne(order.paymentId)).toMatchObject({
      status: PaymentStatus.DECLINED,
      declineReason: 'Declined by provider',
    });
  });

  it.each<PaymentStatus.SUCCESS | PaymentStatus.EXPIRED>([
    PaymentStatus.SUCCESS,
    PaymentStatus.EXPIRED,
  ])(
    'updateStatus complete stores %s with no decline reason',
    async (status) => {
      const order = await create();

      await payments.lock(order.paymentId, async (lock) =>
        payments.updateStatus({ kind: 'complete', status }, lock),
      );

      expect(await payments.getOne(order.paymentId)).toMatchObject({
        status,
        declineReason: null,
      });
    },
  );

  it('insertOneOrIgnore deduplicates matched events while retaining both deliveries', async () => {
    const order = await create();
    const event = newEvent(order.id);

    expect(await record(event)).toMatchObject({ eventId: event.eventId });
    expect(await record(event)).toBeNull();

    expect(await context.dataSource.manager.count(WebhookDeliveryEntity)).toBe(
      2,
    );
    expect(await context.dataSource.manager.find(ProviderEventEntity)).toEqual([
      expect.objectContaining({
        attemptId: order.id,
        paymentId: order.paymentId,
        processedAt: null,
      }),
    ]);
  });

  it.each([randomUUID(), 'not-a-uuid', null])(
    'insertOneOrIgnore routes unmatched reference %s to an already processed review',
    async (reference) => {
      const event = newEvent(reference);

      expect(await record(event)).toMatchObject({ eventId: event.eventId });
      expect(await record(event)).toBeNull();

      const rows = await context.dataSource.manager.find(ProviderEventEntity);
      expect(rows).toEqual([
        expect.objectContaining({
          result: EventResult.SENT_TO_REVIEW,
          processedAt: NOW,
          paymentId: null,
          attemptId: null,
        }),
      ]);
      expect(
        await context.dataSource.manager.find(ReviewRequestEntity),
      ).toEqual([
        expect.objectContaining({
          reason: ReviewReason.UNMATCHED_EVENT,
          providerEventId: rows[0].id,
          paymentId: null,
          attemptId: null,
        }),
      ]);
    },
  );

  it('listUnprocessed preserves observation details and arrival order; updateProcessed removes the event', async () => {
    const order = await create();
    const later = newEvent(order.id, { receivedAt: LATER });
    const earlier = newEvent(order.id);
    await record(later);
    await record(earlier);

    expect(await events.listPaymentIdsWithUnprocessed(10)).toEqual([
      order.paymentId,
    ]);
    await payments.lock(order.paymentId, async (lock) => {
      const inbox = await events.listUnprocessed(lock);
      const first = await context.dataSource.manager.findOneByOrFail(
        ProviderEventEntity,
        { eventId: earlier.eventId },
      );
      expect(inbox).toHaveLength(2);
      expect(inbox[0]).toMatchObject({
        id: first.id,
        attemptId: order.id,
        providerStatus: earlier.observation.status,
        failureCause: earlier.observation.cause,
        providerCode: earlier.observation.code,
        providerMessage: earlier.observation.message,
      });
      await events.updateProcessed(
        { id: first.id, result: EventResult.APPLIED, processedAt: LATER },
        lock,
      );
      expect(await events.listUnprocessed(lock)).toEqual([inbox[1]]);
      await expect(
        events.updateProcessed(
          {
            id: first.id,
            result: EventResult.IGNORED,
            processedAt: LATER,
          },
          lock,
        ),
      ).rejects.toMatchObject({ code: 1004 });
    });
  });

  it('getOne and listDue round-trip amount_minor 9007199254740993 exactly', async () => {
    const order = await create();

    expect((await payments.getOne(order.paymentId))?.amountMinor).toBe(
      9007199254740993n,
    );
    const [due] = await attempts.listDue(NOW, 10);

    expect(due).toEqual(order);
    expect(due.payment.amountMinor).toBe(9007199254740993n);
    expect(await payments.getOne(randomUUID())).toBeNull();
  });

  it('listDue returns only open attempts due by now, ordered and limited', async () => {
    const due = await create();
    const pending = await create(
      {},
      {
        attemptNo: 1,
        connector: ConnectorName.ALPHA,
        nextCheckAt: new Date(NOW.getTime() - 1000),
      },
    );
    await create(
      {},
      { attemptNo: 1, connector: ConnectorName.ALPHA, nextCheckAt: LATER },
    );
    await create(
      {},
      { attemptNo: 1, connector: ConnectorName.ALPHA, nextCheckAt: null },
    );
    const terminal = await create();
    await payments.lock(pending.paymentId, async (lock) =>
      attempts.updateStatus(pendingUpdate(pending.id), lock),
    );
    await payments.lock(terminal.paymentId, async (lock) =>
      attempts.updateStatus(
        pendingUpdate(terminal.id, {
          change: {
            from: AttemptStatus.UNKNOWN,
            status: AttemptStatus.SUCCEEDED,
            failureCause: null,
          },
        }),
        lock,
      ),
    );

    expect((await attempts.listDue(NOW, 10)).map((row) => row.id)).toEqual([
      pending.id,
      due.id,
    ]);
    expect((await attempts.listDue(NOW, 1)).map((row) => row.id)).toEqual([
      pending.id,
    ]);
  });

  it('creating a second open attempt throws typed OPEN_ATTEMPT_EXISTS', async () => {
    const order = await create();

    await expect(
      payments.lock(order.paymentId, async (lock) =>
        attempts.insertOne(
          {
            attemptNo: 2,
            connector: ConnectorName.BRAVO,
            nextCheckAt: null,
          },
          lock,
        ),
      ),
    ).rejects.toEqual(
      new DatabaseException(DatabaseException.Message.OPEN_ATTEMPT_EXISTS),
    );
  });

  it('review and event writes cannot cross the locked payment boundary', async () => {
    const first = await create();
    const second = await create();
    const event = newEvent(second.id);
    await record(event);
    const stored = await context.dataSource.manager.findOneByOrFail(
      ProviderEventEntity,
      { eventId: event.eventId },
    );

    await payments.lock(first.paymentId, async (lock) => {
      await expect(
        reviews.insertOne(
          {
            attemptId: second.id,
            reason: ReviewReason.UNCONFIRMED_REJECT,
            providerEventId: null,
            raisedAt: NOW,
          },
          lock,
        ),
      ).rejects.toMatchObject({ code: 1005 });
      await expect(
        reviews.insertOne(
          {
            attemptId: first.id,
            reason: ReviewReason.UNCONFIRMED_REJECT,
            providerEventId: stored.id,
            raisedAt: NOW,
          },
          lock,
        ),
      ).rejects.toMatchObject({ code: 1005 });
      expect(await events.listUnprocessed(lock)).toEqual([]);
      await expect(
        events.updateProcessed(
          {
            id: stored.id,
            result: EventResult.APPLIED,
            processedAt: LATER,
          },
          lock,
        ),
      ).rejects.toMatchObject({ code: 1004 });
    });
    expect(await context.dataSource.manager.count(ReviewRequestEntity)).toBe(0);
  });

  it('missing payments throw for the normal lock and return null for skip', async () => {
    const id = randomUUID();

    await expect(
      payments.lock(id, async () => Promise.resolve('unexpected')),
    ).rejects.toMatchObject({ code: 4000 });
    expect(
      await payments.lockOrSkip(id, async () => Promise.resolve('unexpected')),
    ).toBeNull();
  });
});
