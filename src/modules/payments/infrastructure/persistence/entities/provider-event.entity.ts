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
  ConnectorName,
  EventResult,
  FailureCause,
  ProviderStatus,
} from '../../../domain/shared/payment-enums';

import type { ProviderEvent } from '../../../domain/webhook/provider-event';

import { PaymentEntity } from './payment.entity';
import { PaymentAttemptEntity } from './payment-attempt.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';

@Unique(...ProviderEventEntity.UNIQUE__CONNECTOR_EVENT_ID)
@Check(...ProviderEventEntity.CHECK__PROCESSED_AT)
@Check(...ProviderEventEntity.CHECK__FAILURE_CAUSE)
@Check(...ProviderEventEntity.CHECK__PAYMENT_ID)
@Index(...ProviderEventEntity.INDEX__UNPROCESSED)
@Entity(ProviderEventEntity.TABLE_NAME)
export class ProviderEventEntity implements ProviderEvent {
  public static get TABLE_NAME(): string {
    return 'provider_events';
  }

  public static get PRIMARY_KEY(): [name: string] {
    return ['provider_events__id__pk'];
  }

  public static get UNIQUE__CONNECTOR_EVENT_ID(): [
    name: string,
    columns: string[],
  ] {
    return [
      'provider_events__connector_event_id__uniq',
      ['connector', 'eventId'],
    ];
  }

  public static get CHECK__PROCESSED_AT(): [name: string, expression: string] {
    return [
      'provider_events__processed_at__check',
      '(processed_at IS NOT NULL) = (result IS NOT NULL)',
    ];
  }

  public static get CHECK__FAILURE_CAUSE(): [name: string, expression: string] {
    return [
      'provider_events__failure_cause__check',
      "failure_cause IS NULL OR provider_status = 'FAILED'",
    ];
  }

  public static get CHECK__PAYMENT_ID(): [name: string, expression: string] {
    return [
      'provider_events__payment_id__check',
      '(payment_id IS NULL) = (attempt_id IS NULL)',
    ];
  }

  public static get INDEX__UNPROCESSED(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'provider_events__unprocessed__idx',
      ['paymentId', 'receivedAt'],
      { where: 'processed_at IS NULL', unique: false },
    ];
  }

  public static get FK__DELIVERY_ID(): [name: string, column: string] {
    return ['provider_events__delivery_id__fk', 'delivery_id'];
  }

  public static get FK__ATTEMPT_ID(): [name: string, column: string] {
    return ['provider_events__attempt_id__fk', 'attempt_id'];
  }

  public static get FK__PAYMENT_ID(): [name: string, column: string] {
    return ['provider_events__payment_id__fk', 'payment_id'];
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: ProviderEventEntity.PRIMARY_KEY[0],
  })
  public id!: string;

  @Column({
    name: 'connector',
    type: 'enum',
    enum: ConnectorName,
    enumName: 'connector_enum',
  })
  public connector!: ConnectorName;

  @Column({ name: 'event_id', type: 'text' })
  public eventId!: string;

  @Column({ name: 'delivery_id', type: 'uuid' })
  public deliveryId!: string;

  @Column({ name: 'raw_type', type: 'text' })
  public rawType!: string;

  @Column({
    name: 'provider_status',
    type: 'enum',
    enum: ProviderStatus,
    enumName: 'provider_events_provider_status_enum',
    nullable: true,
  })
  public providerStatus!: ProviderStatus | null;

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

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  public attemptId!: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  public paymentId!: string | null;

  @Column({ name: 'payload', type: 'jsonb' })
  public payload!: object;

  @Column({
    name: 'result',
    type: 'enum',
    enum: EventResult,
    enumName: 'provider_events_result_enum',
    nullable: true,
  })
  public result!: EventResult | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  public receivedAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  public processedAt!: Date | null;

  @ManyToOne(() => WebhookDeliveryEntity, {
    nullable: false,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ProviderEventEntity.FK__DELIVERY_ID[1],
    foreignKeyConstraintName: ProviderEventEntity.FK__DELIVERY_ID[0],
  })
  public delivery?: WebhookDeliveryEntity;

  @ManyToOne(() => PaymentAttemptEntity, {
    nullable: true,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ProviderEventEntity.FK__ATTEMPT_ID[1],
    foreignKeyConstraintName: ProviderEventEntity.FK__ATTEMPT_ID[0],
  })
  public attempt?: PaymentAttemptEntity | null;

  @ManyToOne(() => PaymentEntity, {
    nullable: true,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ProviderEventEntity.FK__PAYMENT_ID[1],
    foreignKeyConstraintName: ProviderEventEntity.FK__PAYMENT_ID[0],
  })
  public payment?: PaymentEntity | null;
}
