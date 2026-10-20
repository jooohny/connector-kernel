import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

import {
  AttemptStatus,
  ConnectorName,
  FailureCause,
} from '../../../domain/shared/payment-enums';

import type { Attempt } from '../../../domain/payment/payment';

import { BaseEntity } from './base.entity';
import { PaymentEntity } from './payment.entity';

@Unique(...PaymentAttemptEntity.UNIQUE__PAYMENT_ID_CONNECTOR)
@Check(...PaymentAttemptEntity.CHECK__ATTEMPT_NO)
@Unique(...PaymentAttemptEntity.UNIQUE__PAYMENT_ID_ATTEMPT_NO)
@Check(...PaymentAttemptEntity.CHECK__FAILURE_CAUSE_STATUS)
@Index(...PaymentAttemptEntity.INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED)
@Index(...PaymentAttemptEntity.INDEX__DUE)
@Entity(PaymentAttemptEntity.TABLE_NAME)
export class PaymentAttemptEntity extends BaseEntity implements Attempt {
  public static override get TABLE_NAME(): string {
    return 'payment_attempts';
  }

  public static get PRIMARY_KEY(): [name: string] {
    return ['payment_attempts__id__pk'];
  }

  public static get UNIQUE__PAYMENT_ID_CONNECTOR(): [
    name: string,
    columns: string[],
  ] {
    return [
      'payment_attempts__payment_id_connector__uniq',
      ['paymentId', 'connector'],
    ];
  }

  public static get CHECK__ATTEMPT_NO(): [name: string, expression: string] {
    return [
      'payment_attempts__attempt_no__check',
      'attempt_no BETWEEN 1 AND 3',
    ];
  }

  public static get UNIQUE__PAYMENT_ID_ATTEMPT_NO(): [
    name: string,
    columns: string[],
  ] {
    return [
      'payment_attempts__payment_id_attempt_no__uniq',
      ['paymentId', 'attemptNo'],
    ];
  }

  public static get CHECK__FAILURE_CAUSE_STATUS(): [
    name: string,
    expression: string,
  ] {
    return [
      'payment_attempts__failure_cause_status__check',
      `(failure_cause IS NOT NULL) = (status = 'FAILED')`,
    ];
  }

  public static get INDEX__UNIQUE__ONE_OPEN_OR_SUCCEEDED(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'payment_attempts__one_open_or_succeeded__uniq',
      ['paymentId'],
      { where: `status IN ('UNKNOWN', 'PENDING', 'SUCCEEDED')`, unique: true },
    ];
  }

  public static get INDEX__DUE(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'payment_attempts__due__idx',
      ['nextCheckAt'],
      { where: 'next_check_at IS NOT NULL', unique: false },
    ];
  }

  public static get FK__PAYMENT_ID(): [name: string, column: string] {
    return ['payment_attempts__payment_id__fk', 'payment_id'];
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: PaymentAttemptEntity.PRIMARY_KEY[0],
  })
  public id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  public paymentId!: string;

  @Column({ name: 'attempt_no', type: 'smallint' })
  public attemptNo!: number;

  @Column({
    name: 'connector',
    type: 'enum',
    enum: ConnectorName,
    enumName: 'connector_enum',
  })
  public connector!: ConnectorName;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttemptStatus,
    enumName: 'payment_attempts_status_enum',
    default: AttemptStatus.UNKNOWN,
  })
  public status!: AttemptStatus;

  @Column({
    name: 'failure_cause',
    type: 'enum',
    enum: FailureCause,
    enumName: 'payment_attempts_failure_cause_enum',
    nullable: true,
  })
  public failureCause!: FailureCause | null;

  @Column({ name: 'provider_code', type: 'text', nullable: true })
  public providerCode!: string | null;

  @Column({ name: 'provider_message', type: 'text', nullable: true })
  public providerMessage!: string | null;

  @Column({ name: 'provider_order_id', type: 'text', nullable: true })
  public providerOrderId!: string | null;

  @Column({ name: 'details_returned', type: 'boolean', default: false })
  public detailsReturned!: boolean;

  @Column({ name: 'next_check_at', type: 'timestamptz', nullable: true })
  public nextCheckAt!: Date | null;

  @ManyToOne(() => PaymentEntity, {
    nullable: false,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: PaymentAttemptEntity.FK__PAYMENT_ID[1],
    foreignKeyConstraintName: PaymentAttemptEntity.FK__PAYMENT_ID[0],
  })
  public payment?: PaymentEntity;
}
