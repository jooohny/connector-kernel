import { createHmac } from 'node:crypto';

import type { WebhookEnvelope } from '../../src/modules/payments/domain';

export function alphaWebhook(
  body: Record<string, unknown>,
  secret: string,
): WebhookEnvelope {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');

  return { headers: { 'x-alpha-signature': signature }, rawBody };
}

export function bravoWebhook(
  body: Record<string, unknown>,
  secret: string,
  now: Date,
): WebhookEnvelope {
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = Math.floor(now.getTime() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
    .digest('base64');

  return {
    headers: { 'bravo-timestamp': timestamp, 'bravo-signature': signature },
    rawBody,
  };
}
