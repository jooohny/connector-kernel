import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ResolvedBy, ReviewReason } from '../../../domain/shared/payment-enums';

import type { Review } from '../../../domain/review/review';

import { BaseEntity } from './base.entity';
import { PaymentEntity } from './payment.entity';
import { PaymentAttemptEntity } from './payment-attempt.entity';
import { ProviderEventEntity } from './provider-event.entity';

@Check(...ReviewRequestEntity.CHECK__ATTEMPT_ID)
@Check(...ReviewRequestEntity.CHECK__PAYMENT_ID)
@Check(...ReviewRequestEntity.CHECK__RESOLUTION)
@Index(...ReviewRequestEntity.INDEX__UNIQUE__OPEN_PER_ATTEMPT_REASON)
@Index(...ReviewRequestEntity.INDEX__OPEN)
@Entity(ReviewRequestEntity.TABLE_NAME)
export class ReviewRequestEntity extends BaseEntity implements Review {
  public static override get TABLE_NAME(): string {
    return 'review_requests';
  }

  public static get PRIMARY_KEY(): [name: string] {
    return ['review_requests__id__pk'];
  }

  public static get CHECK__ATTEMPT_ID(): [name: string, expression: string] {
    return [
      'review_requests__attempt_id__check',
      `(attempt_id IS NULL) = (reason = 'UNMATCHED_EVENT')`,
    ];
  }

  public static get CHECK__PAYMENT_ID(): [name: string, expression: string] {
    return [
      'review_requests__payment_id__check',
      '(payment_id IS NULL) = (attempt_id IS NULL)',
    ];
  }

  public static get CHECK__RESOLUTION(): [name: string, expression: string] {
    return [
      'review_requests__resolution__check',
      '(resolved_by IS NOT NULL) = (resolved_at IS NOT NULL)',
    ];
  }

  public static get INDEX__UNIQUE__OPEN_PER_ATTEMPT_REASON(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'review_requests__open_per_attempt_reason__uniq',
      ['attemptId', 'reason'],
      { where: 'resolved_at IS NULL', unique: true },
    ];
  }

  public static get INDEX__OPEN(): [
    name: string,
    columns: string[],
    options: { where: string; unique: boolean },
  ] {
    return [
      'review_requests__open__idx',
      ['paymentId'],
      { where: 'resolved_at IS NULL', unique: false },
    ];
  }

  public static get FK__PAYMENT_ID(): [name: string, column: string] {
    return ['review_requests__payment_id__fk', 'payment_id'];
  }

  public static get FK__ATTEMPT_ID(): [name: string, column: string] {
    return ['review_requests__attempt_id__fk', 'attempt_id'];
  }

  public static get FK__PROVIDER_EVENT_ID(): [name: string, column: string] {
    return ['review_requests__provider_event_id__fk', 'provider_event_id'];
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: ReviewRequestEntity.PRIMARY_KEY[0],
  })
  public id!: string;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  public paymentId!: string | null;

  @Column({ name: 'attempt_id', type: 'uuid', nullable: true })
  public attemptId!: string | null;

  @Column({ name: 'provider_event_id', type: 'uuid', nullable: true })
  public providerEventId!: string | null;

  @Column({
    name: 'reason',
    type: 'enum',
    enum: ReviewReason,
    enumName: 'review_requests_reason_enum',
  })
  public reason!: ReviewReason;

  @Column({ name: 'raised_at', type: 'timestamptz' })
  public raisedAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  public resolvedAt!: Date | null;

  @Column({
    name: 'resolved_by',
    type: 'enum',
    enum: ResolvedBy,
    enumName: 'review_requests_resolved_by_enum',
    nullable: true,
  })
  public resolvedBy!: ResolvedBy | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  public resolutionNote!: string | null;

  @ManyToOne(() => PaymentEntity, {
    nullable: true,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ReviewRequestEntity.FK__PAYMENT_ID[1],
    foreignKeyConstraintName: ReviewRequestEntity.FK__PAYMENT_ID[0],
  })
  public payment?: PaymentEntity | null;

  @ManyToOne(() => PaymentAttemptEntity, {
    nullable: true,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ReviewRequestEntity.FK__ATTEMPT_ID[1],
    foreignKeyConstraintName: ReviewRequestEntity.FK__ATTEMPT_ID[0],
  })
  public attempt?: PaymentAttemptEntity | null;

  @ManyToOne(() => ProviderEventEntity, {
    nullable: true,
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: ReviewRequestEntity.FK__PROVIDER_EVENT_ID[1],
    foreignKeyConstraintName: ReviewRequestEntity.FK__PROVIDER_EVENT_ID[0],
  })
  public providerEvent?: ProviderEventEntity | null;
}
