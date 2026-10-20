import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import {
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../../domain/shared/payment-enums';

import type { CreatedPayment, Payment } from '../../../domain/payment/payment';

import { BaseEntity } from './base.entity';

/** pg returns int8 as a string. */
const BIGINT_COLUMN = {
  to: (value: bigint): string => value.toString(),
  from: (value: string): bigint => BigInt(value),
};

@Unique(...PaymentEntity.UNIQUE__IDEMPOTENCY_KEY)
@Check(...PaymentEntity.CHECK__COUNTRY_ISO2)
@Check(...PaymentEntity.CHECK__CURRENCY_ISO3)
@Check(...PaymentEntity.CHECK__AMOUNT_MINOR)
@Check(...PaymentEntity.CHECK__WITHDRAWAL_FIELDS)
@Check(...PaymentEntity.CHECK__DECLINE_REASON)
@Index(...PaymentEntity.INDEX__LIFETIME_OPEN)
@Entity(PaymentEntity.TABLE_NAME)
export class PaymentEntity extends BaseEntity implements Payment {
  public static override get TABLE_NAME(): string {
    return 'payments';
  }

  public static get PRIMARY_KEY(): [name: string] {
    return ['payments__id__pk'];
  }

  public static get UNIQUE__IDEMPOTENCY_KEY(): [
    name: string,
    columns: string[],
  ] {
    return ['payments__idempotency_key__uniq', ['idempotencyKey']];
  }

  public static get CHECK__COUNTRY_ISO2(): [name: string, expression: string] {
    return ['payments__country_iso2__check', `country_iso2 ~ '^[A-Z]{2}$'`];
  }

  public static get CHECK__CURRENCY_ISO3(): [name: string, expression: string] {
    return ['payments__currency_iso3__check', `currency_iso3 ~ '^[A-Z]{3}$'`];
  }

  public static get CHECK__AMOUNT_MINOR(): [name: string, expression: string] {
    return ['payments__amount_minor__check', 'amount_minor > 0'];
  }

  public static get CHECK__WITHDRAWAL_FIELDS(): [
    name: string,
    expression: string,
  ] {
    return [
      'payments__withdrawal_fields__check',
      `(type = 'withdrawal' AND bank_id IS NOT NULL AND account_number IS NOT NULL AND account_name IS NOT NULL) OR (type <> 'withdrawal' AND bank_id IS NULL AND account_number IS NULL AND account_name IS NULL)`,
    ];
  }

  public static get CHECK__DECLINE_REASON(): [
    name: string,
    expression: string,
  ] {
    return [
      'payments__decline_reason__check',
      `(decline_reason IS NOT NULL) = (status = 'declined')`,
    ];
  }

  public static get INDEX__LIFETIME_OPEN(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'payments__lifetime_open__idx',
      ['lifetimeEndsAt'],
      { where: `status = 'processing'`, unique: false },
    ];
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: PaymentEntity.PRIMARY_KEY[0],
  })
  public id!: string;

  @Column({ name: 'idempotency_key', type: 'text' })
  public idempotencyKey!: string;

  @Column({ name: 'result_snapshot', type: 'jsonb', nullable: true })
  public resultSnapshot!: CreatedPayment | null;

  @Column({
    name: 'type',
    type: 'enum',
    enum: PaymentType,
    enumName: 'payments_type_enum',
  })
  public type!: PaymentType;

  @Column({
    name: 'method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payments_method_enum',
  })
  public method!: PaymentMethod;

  @Column({ name: 'country_iso2', type: 'text' })
  public countryIso2!: string;

  @Column({ name: 'currency_iso3', type: 'text' })
  public currencyIso3!: string;

  @Column({ name: 'amount_minor', type: 'bigint', transformer: BIGINT_COLUMN })
  public amountMinor!: bigint;

  @Column({ name: 'bank_id', type: 'text', nullable: true })
  public bankId!: string | null;

  @Column({ name: 'account_number', type: 'text', nullable: true })
  public accountNumber!: string | null;

  @Column({ name: 'account_name', type: 'text', nullable: true })
  public accountName!: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'payments_status_enum',
    default: PaymentStatus.PROCESSING,
  })
  public status!: PaymentStatus;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  public declineReason!: string | null;

  @Column({ name: 'lifetime_ends_at', type: 'timestamptz' })
  public lifetimeEndsAt!: Date;
}
