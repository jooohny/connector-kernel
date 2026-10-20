import type { WebhookDelivery } from './webhook-delivery';

export const WEBHOOK_DELIVERY_REPOSITORY = Symbol(
  'WEBHOOK_DELIVERY_REPOSITORY',
);

export interface WebhookDeliveryRepository {
  insertOne(delivery: Omit<WebhookDelivery, 'id'>): Promise<WebhookDelivery>;
}
