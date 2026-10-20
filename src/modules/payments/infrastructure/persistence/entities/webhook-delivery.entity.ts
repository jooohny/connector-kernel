import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { SignatureStatus } from '../../../domain/shared/payment-enums';
import type { WebhookDelivery } from '../../../domain/webhook/webhook-delivery';

@Entity(WebhookDeliveryEntity.TABLE_NAME)
export class WebhookDeliveryEntity implements WebhookDelivery {
  public static get TABLE_NAME(): string {
    return 'webhook_deliveries';
  }

  public static get PRIMARY_KEY(): [name: string] {
    return ['webhook_deliveries__id__pk'];
  }

  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: WebhookDeliveryEntity.PRIMARY_KEY[0],
  })
  public id!: string;

  @Column({ name: 'connector', type: 'text' })
  public connector!: string;

  @Column({ name: 'headers', type: 'jsonb' })
  public headers!: WebhookDelivery['headers'];

  @Column({ name: 'raw_body', type: 'bytea' })
  public rawBody!: Buffer;

  @Column({
    name: 'signature_status',
    type: 'enum',
    enum: SignatureStatus,
    enumName: 'webhook_deliveries_signature_status_enum',
  })
  public signatureStatus!: SignatureStatus;

  @Column({ name: 'event_id', type: 'text', nullable: true })
  public eventId!: string | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  public receivedAt!: Date;
}
