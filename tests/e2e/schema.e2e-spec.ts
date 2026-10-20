import { SqlState } from '../../src/modules/payments/infrastructure/persistence/repositories/base';
import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import {
  AttemptStatus,
  ConnectorName,
  FailureCause,
  PaymentMethod,
  PaymentType,
  ProviderStatus,
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

import {
  type E2eContext,
  resetDatabase,
  startE2eContext,
  stopE2eContext,
} from './e2e-context';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const LIFETIME_END = new Date('2026-10-17T12:15:00.000Z');
const SCHEMA_NAMES = [
  {
    table: PaymentEntity.TABLE_NAME,
    constraints: [
      PaymentEntity.PRIMARY_KEY[0],
      PaymentEntity.UNIQUE__IDEMPOTENCY_KEY[0],
      PaymentEntity.CHECK__COUNTRY_ISO2[0],
      PaymentEntity.CHECK__CURRENCY_ISO3[0],
      PaymentEntity.CHECK__AMOUNT_MINOR[0],
      PaymentEntity.CHECK__WITHDRAWAL_FIELDS[0],
      PaymentEntity.CHECK__DECLINE_REASON[0],
    ],
    indexes: [PaymentEntity.INDEX__LIFETIME_OPEN[0]],
  },
  {
    table: PaymentAttemptEntity.TABLE_NAME,
    constraints: [
      PaymentAttemptEntity.PRIMARY_KEY[0],
      PaymentAttemptEntity.UNIQUE__PAYMENT_ID_CONNECTOR[0],
      PaymentAttemptEntity.CHECK__ATTEMPT_NO[0],
      PaymentAttemptEntity.UNIQUE__PAYMENT_ID_ATTEMPT_NO[0],
      PaymentAttemptEntity.CHECK__FAILURE_CAUSE_STATUS[0],
      PaymentAttemptEntity.FK__PAYMENT_ID[0],
    ],
    indexes: [
      PaymentAttemptEntity.INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED[0],
      PaymentAttemptEntity.INDEX__DUE[0],
    ],
  },
  {
    table: WebhookDeliveryEntity.TABLE_NAME,
    constraints: [WebhookDeliveryEntity.PRIMARY_KEY[0]],
    indexes: [],
  },
  {
    table: ProviderEventEntity.TABLE_NAME,
    constraints: [
      ProviderEventEntity.PRIMARY_KEY[0],
      ProviderEventEntity.UNIQUE__CONNECTOR_EVENT_ID[0],
      ProviderEventEntity.CHECK__PROCESSED_AT[0],
      ProviderEventEntity.CHECK__FAILURE_CAUSE[0],
      ProviderEventEntity.CHECK__PAYMENT_ID[0],
      ProviderEventEntity.FK__DELIVERY_ID[0],
      ProviderEventEntity.FK__ATTEMPT_ID[0],
      ProviderEventEntity.FK__PAYMENT_ID[0],
    ],
    indexes: [ProviderEventEntity.INDEX__UNPROCESSED[0]],
  },
  {
    table: ReviewRequestEntity.TABLE_NAME,
    constraints: [
      ReviewRequestEntity.PRIMARY_KEY[0],
      ReviewRequestEntity.CHECK__ATTEMPT_ID[0],
      ReviewRequestEntity.CHECK__PAYMENT_ID[0],
      ReviewRequestEntity.CHECK__RESOLUTION[0],
      ReviewRequestEntity.FK__PAYMENT_ID[0],
      ReviewRequestEntity.FK__ATTEMPT_ID[0],
      ReviewRequestEntity.FK__PROVIDER_EVENT_ID[0],
    ],
    indexes: [
      ReviewRequestEntity.INDEX__UNIQUE__OPEN_PER_ATTEMPT_REASON[0],
      ReviewRequestEntity.INDEX__OPEN[0],
    ],
  },
];

async function insertPayment(
  dataSource: DataSource,
  overrides: {
    countryIso2?: string;
    currencyIso3?: string;
    amountMinor?: string;
    type?: PaymentType;
    bankId?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
  } = {},
): Promise<string> {
  const id = randomUUID();

  await dataSource.query(
    `INSERT INTO payments (
      id, idempotency_key, type, method, country_iso2, currency_iso3,
      amount_minor, bank_id, account_number, account_name, lifetime_ends_at
    ) VALUES ($1, $2, $3, $4, $10, $11, $5, $6, $7, $8, $9)`,
    [
      id,
      randomUUID(),
      overrides.type ?? PaymentType.DEPOSIT,
      PaymentMethod.QR,
      overrides.amountMinor ?? '15000000',
      overrides.bankId ?? null,
      overrides.accountNumber ?? null,
      overrides.accountName ?? null,
      LIFETIME_END,
      overrides.countryIso2 ?? 'ID',
      overrides.currencyIso3 ?? 'IDR',
    ],
  );

  return id;
}

async function insertAttempt(
  dataSource: DataSource,
  paymentId: string,
  overrides: {
    status?: AttemptStatus;
    connector?: ConnectorName;
    attemptNo?: number;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const status = overrides.status ?? AttemptStatus.UNKNOWN;

  await dataSource.query(
    `INSERT INTO payment_attempts (
      id, payment_id, attempt_no, connector, status, failure_cause
    ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      paymentId,
      overrides.attemptNo ?? 1,
      overrides.connector ?? ConnectorName.ALPHA,
      status,
      status === AttemptStatus.FAILED ? FailureCause.PROVIDER : null,
    ],
  );

  return id;
}

async function insertDelivery(dataSource: DataSource): Promise<string> {
  const rows = await dataSource.query<{ id: string }[]>(
    `INSERT INTO webhook_deliveries (connector, headers, raw_body, signature_status, received_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [ConnectorName.ALPHA, {}, Buffer.from('{}'), SignatureStatus.VALID, NOW],
  );
  expect(rows).toHaveLength(1);

  return rows[0].id;
}

async function insertEvent(
  dataSource: DataSource,
  deliveryId: string,
): Promise<unknown> {
  return dataSource.query(
    `INSERT INTO provider_events (connector, event_id, delivery_id, raw_type, payload, received_at)
     VALUES ($1, 'event-1', $2, 'paid', $3, $4)`,
    [ConnectorName.ALPHA, deliveryId, {}, NOW],
  );
}

async function insertReview(
  dataSource: DataSource,
  paymentId: string | null,
  attemptId: string | null,
  reason = ReviewReason.LIFETIME_ENDED_UNRESOLVED,
): Promise<unknown> {
  return dataSource.query(
    `INSERT INTO review_requests (payment_id, attempt_id, reason, raised_at)
     VALUES ($1, $2, $3, $4)`,
    [paymentId, attemptId, reason, NOW],
  );
}

describe('Payments kernel schema (e2e)', () => {
  let context: E2eContext | undefined;

  function database(): DataSource {
    if (context === undefined) {
      throw new Error('The schema e2e context was not initialized');
    }

    return context.dataSource;
  }

  beforeAll(async () => {
    context = await startE2eContext();
  }, 120_000);

  beforeEach(async () => {
    await resetDatabase(database());
  });

  afterAll(async () => {
    if (context !== undefined) {
      await stopE2eContext(context);
    }
  });

  it.each(SCHEMA_NAMES)(
    'declares every entity constraint and index on $table in PostgreSQL',
    async ({ table, constraints, indexes }) => {
      const actualConstraints: unknown = await database().query(
        `SELECT c.conname AS name
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public' AND t.relname = $1`,
        [table],
      );
      const actualIndexes: unknown = await database().query(
        `SELECT indexname AS name FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1`,
        [table],
      );

      expect(actualConstraints).toEqual(
        expect.arrayContaining(constraints.map((name) => ({ name }))),
      );
      expect(actualIndexes).toEqual(
        expect.arrayContaining(indexes.map((name) => ({ name }))),
      );
    },
  );

  it.each([AttemptStatus.UNKNOWN, AttemptStatus.PENDING])(
    'rejects a second open attempt beside a %s attempt with the open-or-succeeded index',
    async (status) => {
      const paymentId = await insertPayment(database());
      await insertAttempt(database(), paymentId, { status });

      await expect(
        insertAttempt(database(), paymentId, {
          connector: ConnectorName.BRAVO,
          attemptNo: 2,
        }),
      ).rejects.toMatchObject({
        driverError: {
          code: SqlState.UNIQUE_VIOLATION,
          constraint:
            PaymentAttemptEntity.INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED[0],
        },
      });
    },
  );

  it('rejects a new attempt beside SUCCEEDED with the open-or-succeeded index', async () => {
    const paymentId = await insertPayment(database());
    await insertAttempt(database(), paymentId, {
      status: AttemptStatus.SUCCEEDED,
    });

    await expect(
      insertAttempt(database(), paymentId, {
        connector: ConnectorName.BRAVO,
        attemptNo: 2,
      }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.UNIQUE_VIOLATION,
        constraint:
          PaymentAttemptEntity.INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED[0],
      },
    });
  });

  it('allows a new open attempt after the only attempt has FAILED', async () => {
    const paymentId = await insertPayment(database());
    await insertAttempt(database(), paymentId, {
      status: AttemptStatus.FAILED,
    });

    const attemptId = await insertAttempt(database(), paymentId, {
      connector: ConnectorName.BRAVO,
      attemptNo: 2,
    });
    const rows: unknown = await database().query(
      'SELECT id, status FROM payment_attempts WHERE id = $1',
      [attemptId],
    );

    expect(rows).toEqual([{ id: attemptId, status: AttemptStatus.UNKNOWN }]);
  });

  it('rejects the same connector twice for one payment', async () => {
    const paymentId = await insertPayment(database());
    await insertAttempt(database(), paymentId, {
      status: AttemptStatus.FAILED,
    });

    await expect(
      insertAttempt(database(), paymentId, { attemptNo: 2 }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.UNIQUE_VIOLATION,
        constraint: PaymentAttemptEntity.UNIQUE__PAYMENT_ID_CONNECTOR[0],
      },
    });
  });

  it('rejects attempt_no 4 with the attempt number check', async () => {
    const paymentId = await insertPayment(database());

    await expect(
      insertAttempt(database(), paymentId, { attemptNo: 4 }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: PaymentAttemptEntity.CHECK__ATTEMPT_NO[0],
      },
    });
  });

  it('rejects a duplicate connector and event ID with the event unique constraint', async () => {
    const deliveryId = await insertDelivery(database());
    const redeliveryId = await insertDelivery(database());
    await insertEvent(database(), deliveryId);

    await expect(insertEvent(database(), redeliveryId)).rejects.toMatchObject({
      driverError: {
        code: SqlState.UNIQUE_VIOLATION,
        constraint: ProviderEventEntity.UNIQUE__CONNECTOR_EVENT_ID[0],
      },
    });
  });

  it('rejects a failure cause on a non-FAILED provider status', async () => {
    const deliveryId = await insertDelivery(database());
    await insertEvent(database(), deliveryId);

    await expect(
      database().query(
        'UPDATE provider_events SET provider_status = $1, failure_cause = $2',
        [ProviderStatus.PENDING, FailureCause.PROVIDER],
      ),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: ProviderEventEntity.CHECK__FAILURE_CAUSE[0],
      },
    });
  });

  it('rejects an event with a payment but no attempt', async () => {
    const paymentId = await insertPayment(database());
    const deliveryId = await insertDelivery(database());
    await insertEvent(database(), deliveryId);

    await expect(
      database().query('UPDATE provider_events SET payment_id = $1', [
        paymentId,
      ]),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: ProviderEventEntity.CHECK__PAYMENT_ID[0],
      },
    });
  });

  it('rejects a second open review for the same attempt and reason', async () => {
    const paymentId = await insertPayment(database());
    const attemptId = await insertAttempt(database(), paymentId);
    await insertReview(database(), paymentId, attemptId);

    await expect(
      insertReview(database(), paymentId, attemptId),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.UNIQUE_VIOLATION,
        constraint:
          ReviewRequestEntity.INDEX__UNIQUE__OPEN_PER_ATTEMPT_REASON[0],
      },
    });
  });

  it('rejects lowercase country id with the country check', async () => {
    await expect(
      insertPayment(database(), { countryIso2: 'id' }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: PaymentEntity.CHECK__COUNTRY_ISO2[0],
      },
    });
  });

  it('rejects currency IDRX with the currency check', async () => {
    await expect(
      insertPayment(database(), { currencyIso3: 'IDRX' }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: PaymentEntity.CHECK__CURRENCY_ISO3[0],
      },
    });
  });

  it('rejects amount_minor zero with the positive amount check', async () => {
    await expect(
      insertPayment(database(), { amountMinor: '0' }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: PaymentEntity.CHECK__AMOUNT_MINOR[0],
      },
    });
  });

  it('rejects a withdrawal missing bank_id with the withdrawal fields check', async () => {
    await expect(
      insertPayment(database(), {
        type: PaymentType.WITHDRAWAL,
        accountNumber: '123456',
        accountName: 'Test Account',
      }),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: PaymentEntity.CHECK__WITHDRAWAL_FIELDS[0],
      },
    });
  });

  it('rejects an UNMATCHED_EVENT review carrying an attempt ID', async () => {
    const paymentId = await insertPayment(database());
    const attemptId = await insertAttempt(database(), paymentId);

    await expect(
      insertReview(
        database(),
        paymentId,
        attemptId,
        ReviewReason.UNMATCHED_EVENT,
      ),
    ).rejects.toMatchObject({
      driverError: {
        code: SqlState.CHECK_VIOLATION,
        constraint: ReviewRequestEntity.CHECK__ATTEMPT_ID[0],
      },
    });
  });
});
