import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentsKernelSchema1792264548617 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.createEnums(queryRunner);
    await this.createPayment(queryRunner);
    await this.createPaymentAttempt(queryRunner);
    await this.createWebhookDelivery(queryRunner);
    await this.createProviderEvent(queryRunner);
    await this.createReviewRequest(queryRunner);
  }

  public async down(): Promise<void> {
    return Promise.resolve();
  }

  private async createEnums(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE payments_type_enum AS ENUM ('deposit', 'withdrawal')`,
    );
    await queryRunner.query(
      `CREATE TYPE payments_method_enum AS ENUM ('qr', 'bank_transfer')`,
    );
    await queryRunner.query(
      `CREATE TYPE payments_status_enum AS ENUM ('processing', 'success', 'declined', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE connector_enum AS ENUM ('alpha', 'bravo')`,
    );
    await queryRunner.query(
      `CREATE TYPE payment_attempts_status_enum AS ENUM ('UNKNOWN', 'PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE payment_attempts_failure_cause_enum AS ENUM ('PROVIDER', 'CLIENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE webhook_deliveries_signature_status_enum AS ENUM ('VALID', 'INVALID', 'STALE', 'UNKNOWN_CONNECTOR')`,
    );
    await queryRunner.query(
      `CREATE TYPE provider_events_provider_status_enum AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'RETURNED')`,
    );
    await queryRunner.query(
      `CREATE TYPE provider_events_result_enum AS ENUM ('APPLIED', 'IGNORED', 'SENT_TO_REVIEW')`,
    );
    await queryRunner.query(
      `CREATE TYPE review_requests_reason_enum AS ENUM ('LIFETIME_ENDED_UNRESOLVED', 'UNCONFIRMED_REJECT', 'SUCCEEDED_THEN_FAILED', 'FAILED_THEN_SUCCEEDED', 'UNRECOGNISED_EVENT', 'FUNDS_RETURNED', 'UNMATCHED_EVENT')`,
    );
    await queryRunner.query(
      `CREATE TYPE review_requests_resolved_by_enum AS ENUM ('SYSTEM', 'OPERATOR')`,
    );
  }

  private async createPayment(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payments (
        id uuid DEFAULT gen_random_uuid() CONSTRAINT payments__id__pk PRIMARY KEY,
        idempotency_key text NOT NULL,
        result_snapshot jsonb,
        type payments_type_enum NOT NULL,
        method payments_method_enum NOT NULL,
        country_iso2 text NOT NULL,
        currency_iso3 text NOT NULL,
        amount_minor bigint NOT NULL,
        bank_id text,
        account_number text,
        account_name text,
        status payments_status_enum NOT NULL DEFAULT 'processing',
        decline_reason text,
        lifetime_ends_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payments__idempotency_key__uniq UNIQUE (idempotency_key),
        CONSTRAINT payments__country_iso2__check CHECK (country_iso2 ~ '^[A-Z]{2}$'),
        CONSTRAINT payments__currency_iso3__check CHECK (currency_iso3 ~ '^[A-Z]{3}$'),
        CONSTRAINT payments__amount_minor__check CHECK (amount_minor > 0),
        CONSTRAINT payments__withdrawal_fields__check CHECK ((type = 'withdrawal' AND bank_id IS NOT NULL AND account_number IS NOT NULL AND account_name IS NOT NULL) OR (type <> 'withdrawal' AND bank_id IS NULL AND account_number IS NULL AND account_name IS NULL)),
        CONSTRAINT payments__decline_reason__check CHECK ((decline_reason IS NOT NULL) = (status = 'declined'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX payments__lifetime_open__idx
      ON payments (lifetime_ends_at) WHERE status = 'processing'
    `);
  }

  private async createPaymentAttempt(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_attempts (
        id uuid DEFAULT gen_random_uuid() CONSTRAINT payment_attempts__id__pk PRIMARY KEY,
        payment_id uuid NOT NULL,
        attempt_no smallint NOT NULL,
        connector connector_enum NOT NULL,
        status payment_attempts_status_enum NOT NULL DEFAULT 'UNKNOWN',
        failure_cause payment_attempts_failure_cause_enum,
        provider_code text,
        provider_message text,
        provider_order_id text,
        details_returned boolean NOT NULL DEFAULT false,
        next_check_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payment_attempts__payment_id_connector__uniq UNIQUE (payment_id, connector),
        CONSTRAINT payment_attempts__attempt_no__check CHECK (attempt_no BETWEEN 1 AND 3),
        CONSTRAINT payment_attempts__payment_id_attempt_no__uniq UNIQUE (payment_id, attempt_no),
        CONSTRAINT payment_attempts__failure_cause_status__check CHECK ((failure_cause IS NOT NULL) = (status = 'FAILED')),
        CONSTRAINT payment_attempts__payment_id__fk FOREIGN KEY (payment_id) REFERENCES payments (id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX payment_attempts__one_open_or_succeeded__uniq
      ON payment_attempts (payment_id) WHERE status IN ('UNKNOWN', 'PENDING', 'SUCCEEDED')
    `);

    await queryRunner.query(`
      CREATE INDEX payment_attempts__due__idx
      ON payment_attempts (next_check_at) WHERE next_check_at IS NOT NULL
    `);
  }

  private async createWebhookDelivery(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE webhook_deliveries (
        id uuid DEFAULT gen_random_uuid() CONSTRAINT webhook_deliveries__id__pk PRIMARY KEY,
        connector text NOT NULL,
        headers jsonb NOT NULL,
        raw_body bytea NOT NULL,
        signature_status webhook_deliveries_signature_status_enum NOT NULL,
        event_id text,
        received_at timestamptz NOT NULL
      )
    `);
  }

  private async createProviderEvent(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE provider_events (
        id uuid DEFAULT gen_random_uuid() CONSTRAINT provider_events__id__pk PRIMARY KEY,
        connector connector_enum NOT NULL,
        event_id text NOT NULL,
        delivery_id uuid NOT NULL,
        raw_type text NOT NULL,
        provider_status provider_events_provider_status_enum,
        failure_cause payment_attempts_failure_cause_enum,
        provider_code text,
        provider_message text,
        attempt_id uuid,
        payment_id uuid,
        payload jsonb NOT NULL,
        result provider_events_result_enum,
        received_at timestamptz NOT NULL,
        processed_at timestamptz,
        CONSTRAINT provider_events__connector_event_id__uniq UNIQUE (connector, event_id),
        CONSTRAINT provider_events__processed_at__check CHECK ((processed_at IS NOT NULL) = (result IS NOT NULL)),
        CONSTRAINT provider_events__failure_cause__check CHECK (failure_cause IS NULL OR provider_status = 'FAILED'),
        CONSTRAINT provider_events__payment_id__check CHECK ((payment_id IS NULL) = (attempt_id IS NULL)),
        CONSTRAINT provider_events__delivery_id__fk FOREIGN KEY (delivery_id) REFERENCES webhook_deliveries (id),
        CONSTRAINT provider_events__attempt_id__fk FOREIGN KEY (attempt_id) REFERENCES payment_attempts (id),
        CONSTRAINT provider_events__payment_id__fk FOREIGN KEY (payment_id) REFERENCES payments (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX provider_events__unprocessed__idx
      ON provider_events (payment_id, received_at) WHERE processed_at IS NULL
    `);
  }

  private async createReviewRequest(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE review_requests (
        id uuid DEFAULT gen_random_uuid() CONSTRAINT review_requests__id__pk PRIMARY KEY,
        payment_id uuid,
        attempt_id uuid,
        provider_event_id uuid,
        reason review_requests_reason_enum NOT NULL,
        raised_at timestamptz NOT NULL,
        resolved_at timestamptz,
        resolved_by review_requests_resolved_by_enum,
        resolution_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT review_requests__attempt_id__check CHECK ((attempt_id IS NULL) = (reason = 'UNMATCHED_EVENT')),
        CONSTRAINT review_requests__payment_id__check CHECK ((payment_id IS NULL) = (attempt_id IS NULL)),
        CONSTRAINT review_requests__resolution__check CHECK ((resolved_by IS NOT NULL) = (resolved_at IS NOT NULL)),
        CONSTRAINT review_requests__payment_id__fk FOREIGN KEY (payment_id) REFERENCES payments (id),
        CONSTRAINT review_requests__attempt_id__fk FOREIGN KEY (attempt_id) REFERENCES payment_attempts (id),
        CONSTRAINT review_requests__provider_event_id__fk FOREIGN KEY (provider_event_id) REFERENCES provider_events (id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX review_requests__open_per_attempt_reason__uniq
      ON review_requests (attempt_id, reason) WHERE resolved_at IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX review_requests__open__idx
      ON review_requests (payment_id) WHERE resolved_at IS NULL
    `);
  }
}
